// stream.qnt: the life of a MixZ live stream, written down so a checker can walk every path.
//
// Zaal, 7 Nov 2026: "Ok go for it" on ZAOresearch doc 2438 (Quint on the MixZ stream flow).
// Models api/live.js, web/dj/LiveStream.js and web/listen.html as of PR 92.
//
// Run it:   npx @informalsystems/quint run specs/stream.qnt --invariant=allRules --max-steps=12 --max-samples=20000
//
// FIXED = false is the code before this spec; the checker finds the bugs below in seconds.
// FIXED = true is the code after: a stopped host deletes its room, a link answers "ended" once the
// host is gone, and a listener whose mix stops for GRACE ticks is told the stream ended.
module stream {
  pure val FIXED = true

  pure val ROOMS = Set("r1", "r2")       // stream ids (8 digits in real life)
  pure val LOBBIES = Set("zaal", "")         // "" = a stream with no lobby
  pure val LISTENERS = Set("l1", "l2")
  pure val GRACE = 2                      // ticks a listener waits for the mix to come back

  type Room = { lobby: str, hostIn: bool, publishing: bool }

  var rooms: str -> Room                  // rooms that exist on the LiveKit server
  var everStarted: Set[str]               // ids that have been handed out
  var at: str -> str                      // listener -> room id, "" when not in a room
  var view: str -> str                    // what the listen page shows: idle, playing, waiting, ended, nobody
  var quiet: str -> int                   // ticks a listener has had no mix

  def isOpen(r) = rooms.keys().contains(r)
  def without(r) = rooms.keys().exclude(Set(r)).mapBy(k => rooms.get(k))
  def inRoom(r) = LISTENERS.filter(l => at.get(l) == r)
  def hostGone(r) = r.in(everStarted) and (not(isOpen(r)) or not(rooms.get(r).hostIn))
  def liveIn(lob) = rooms.keys().filter(r => rooms.get(r).lobby == lob and rooms.get(r).publishing)

  action init = all {
    rooms' = Map(),
    everStarted' = Set(),
    at' = LISTENERS.mapBy(_ => ""),
    view' = LISTENERS.mapBy(_ => "idle"),
    quiet' = LISTENERS.mapBy(_ => 0),
  }

  // POST /api/live: a new room, the host joins and tries to send the mix.
  // If the mix cannot be sent the host leaves at once (startHost returns null, no link shown).
  action hostStart(r: str, lob: str, sent: bool): bool = all {
    not(r.in(everStarted)),
    // After: a lobby that already has someone live says "someone is live in this lobby" (409).
    not(FIXED) or lob == "" or liveIn(lob) == Set(),
    rooms' = rooms.put(r, { lobby: lob, hostIn: sent, publishing: sent }),
    everStarted' = everStarted.union(Set(r)),
    at' = at, view' = view, quiet' = quiet,
  }

  // STOP, closing the tab, or the laptop dying (no pagehide). The host leaves.
  // Before: the room stays open while anyone is in it. After: a clean stop deletes it (DELETE /api/live).
  action hostStop(r: str, clean: bool): bool = all {
    isOpen(r), rooms.get(r).hostIn,
    if (FIXED and clean) all {
      rooms' = without(r),
      at' = at.keys().mapBy(l => if (at.get(l) == r) "" else at.get(l)),
      view' = view.keys().mapBy(l => if (at.get(l) == r) "ended" else view.get(l)),
    } else all {
      rooms' = rooms.set(r, { ...rooms.get(r), hostIn: false, publishing: false }),
      at' = at,
      view' = view.keys().mapBy(l => if (at.get(l) == r) "waiting" else view.get(l)),
    },
    everStarted' = everStarted, quiet' = quiet,
  }

  // LiveKit closes a room once nobody has been in it for empty_timeout.
  action closeEmpty(r: str): bool = all {
    isOpen(r), not(rooms.get(r).hostIn), inRoom(r) == Set(),
    rooms' = without(r),
    everStarted' = everStarted, at' = at, view' = view, quiet' = quiet,
  }

  // GET /api/live?id=: before, any room that exists gives a ticket; after, only one with the mix on.
  action listenById(l: str, r: str): bool = all {
    at.get(l) == "", r.in(everStarted),
    val open = isOpen(r) and (if (FIXED) rooms.get(r).publishing else true)
    all {
      at' = at.set(l, if (open) r else ""),
      view' = view.set(l, if (not(open)) "ended" else if (rooms.get(r).publishing) "playing" else "waiting"),
    },
    rooms' = rooms, everStarted' = everStarted, quiet' = quiet.set(l, 0),
  }

  // GET /api/live?lobby=: the newest room in the lobby with the mix on.
  action listenByLobby(l: str, lob: str): bool = all {
    at.get(l) == "",
    val live = liveIn(lob)
    if (live == Set()) all { at' = at, view' = view.set(l, "nobody") }
    else nondet r = live.oneOf() all { at' = at.set(l, r), view' = view.set(l, "playing") },
    rooms' = rooms, everStarted' = everStarted, quiet' = quiet.set(l, 0),
  }

  // Time passes for a listener with no mix. After: past GRACE the page says ended and leaves.
  action tick(l: str): bool = all {
    at.get(l) != "", view.get(l) == "waiting",
    if (FIXED and quiet.get(l) + 1 >= GRACE) all {
      at' = at.set(l, ""), view' = view.set(l, "ended"), quiet' = quiet.set(l, 0),
    } else all {
      at' = at, view' = view, quiet' = quiet.set(l, quiet.get(l) + 1),
    },
    rooms' = rooms, everStarted' = everStarted,
  }

  action listenerLeave(l: str): bool = all {
    at.get(l) != "",
    at' = at.set(l, ""), view' = view.set(l, "idle"), quiet' = quiet.set(l, 0),
    rooms' = rooms, everStarted' = everStarted,
  }

  action step = any {
    nondet r = ROOMS.oneOf()
    nondet lob = LOBBIES.oneOf()
    nondet b = Set(true, false).oneOf()
    nondet l = LISTENERS.oneOf()
    any {
      hostStart(r, lob, b),
      hostStop(r, b),
      closeEmpty(r),
      listenById(l, r),
      listenByLobby(l, lob),
      tick(l),
      listenerLeave(l),
    }
  }

  // Rule 1: nobody is stuck in a dead stream. A listener in a room whose host is gone
  // must be on the way out: within GRACE ticks of the mix stopping.
  val noStuckListener = LISTENERS.forall(l =>
    val r = at.get(l)
    r == "" or not(hostGone(r)) or quiet.get(l) < GRACE)

  // Rule 2 (Zaal: lobbies tied to streams): one live stream per lobby.
  val oneLivePerLobby = LOBBIES.forall(lob => lob == "" or liveIn(lob).size() <= 1)

  val allRules = noStuckListener and oneLivePerLobby
}
