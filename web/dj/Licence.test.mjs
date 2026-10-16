// node web/dj/Licence.test.mjs
import { cleanLicence, licenceOf, canPlay, licenceLine, SOURCE_LICENCES, SIGNED, signedFor, audiusCreativeCommons } from './Licence.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };

console.log('Licence');
const grant = { artist: 'IMan Afrikah', uses: { stream: true, dj: true, radio: true, commercial: false }, terms: 'https://example.com/rights' };

check('a full licence is kept', cleanLicence(grant)?.artist === 'IMan Afrikah');
check('no terms link, no licence', cleanLicence({ ...grant, terms: '' }) === null);
check('terms must be a link', cleanLicence({ ...grant, terms: 'ask me' }) === null);
check('no uses allowed, no licence', cleanLicence({ ...grant, uses: {} }) === null);
check('uses only count when exactly true', cleanLicence({ ...grant, uses: { stream: 'yes', dj: true } })?.uses.stream === false);
check('artist can come from the track', cleanLicence({ ...grant, artist: '' }, 'Jango UU')?.artist === 'Jango UU');
check('no artist and no holder, no licence', cleanLicence({ ...grant, artist: '' }) === null);

check('hosted track with its licence plays', canPlay({ title: 'East vol 1', artist: 'IMan Afrikah', licence: grant }).ok);
check('licence inside a data json is read', canPlay({ metadata: { title: 'East vol 1', artist: 'IMan Afrikah', licence: grant } }).ok);
const bare = canPlay({ title: 'Demise', artist: 'Jango UU' });
check('hosted track with no licence is refused', !bare.ok && /No licence on "Demise"/.test(bare.reason));
const radioOnly = canPlay({ title: 'X', licence: { ...grant, uses: { radio: true } } });
check('licence without dj use is refused, and says why', !radioOnly.ok && /stream or dj/.test(radioOnly.reason));
check('only the missing use is named', /for dj\./.test(canPlay({ title: 'X', licence: { ...grant, uses: { stream: true } } }).reason));

check('audius tracks carry the Audius terms', canPlay({ title: 'a', artist: 'b', source: 'audius' }).licence?.terms === SOURCE_LICENCES.audius.terms);
check('songchainn tracks carry the SongChainn terms', canPlay({ title: 'a', source: 'songchainn' }).ok);
check('a platform licence names the artist', licenceOf({ artist: 'N3M3SIS', source: 'songchainn' })?.artist === 'N3M3SIS');
check('source on a loaded deck (_source) counts', canPlay({ _source: 'audius', metadata: { title: 't' } }).ok);
check('soundcloud has no licence here, refused', !canPlay({ title: 'a', source: 'soundcloud' }).ok);
check('spotify has no licence here, refused', !canPlay({ title: 'a', source: 'spotify' }).ok);
check('the DJ\'s own dropped file plays', canPlay({ title: 'mine', source: 'file' }).ok);
check('own licence beats the platform one', licenceOf({ source: 'audius', licence: grant })?.terms === grant.terms);
check('platform licences do not allow commercial use', !canPlay({ title: 'a', source: 'audius' }, ['commercial']).ok);

check('deck line names holder and uses', licenceLine(cleanLicence(grant)) === 'IMan Afrikah: stream, dj, radio');
check('no licence, empty line', licenceLine(null) === '');

const note = SIGNED['iman afrikah'].terms;
check('IMan on SongChainn carries his note', licenceOf({ title: 'Song', artist: 'IMan Afrikah', source: 'songchainn' })?.terms === note);
check('IMan on his own Audius page carries his note', licenceOf({ title: 'x', artist: 'IMan Afrikah', uploader: 'IManAfrikah', source: 'audius' })?.terms === note);
check('IMan song on the WaveWarZ Africa page carries his note', licenceOf({ title: 'IMan Afrikah - 10 10', artist: 'WaveWarZ Africa', uploader: 'WaveWarzAfrica', source: 'audius' })?.terms === note);
check('a collab with IMan carries his note', licenceOf({ title: 'N3M3SIS x IMan Afrikah - TAKE OVER', artist: 'WaveWarZ Africa', uploader: 'WaveWarzAfrica', source: 'audius' })?.terms === note);
check('IMAN AFRIKAH ft SANTANA still counts', !!signedFor({ title: 't', artist: 'IMAN AFRIKAH ft SANTANA' }));
check('another artist on the WaveWarZ Africa page does not get his note', licenceOf({ title: 'CHILL N3M by N3M3SIS', artist: 'WaveWarZ Africa', uploader: 'WaveWarzAfrica', source: 'audius' })?.terms === SOURCE_LICENCES.audius.terms);
check('Audius Creative Commons is read', audiusCreativeCommons('Creative Commons Attribution')?.uses.commercial === true);
check('Audius CC non-commercial is not commercial', audiusCreativeCommons('Creative Commons Attribution-NonCommercial')?.uses.commercial === false);
check('All rights reserved is not CC', audiusCreativeCommons('All rights reserved') === null && audiusCreativeCommons(null) === null);
check('an Audius CC track carries the CC terms', licenceOf({ title: 'a', artist: 'b', source: 'audius', audiusLicense: 'Creative Commons Attribution' })?.terms.includes('creativecommons'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
