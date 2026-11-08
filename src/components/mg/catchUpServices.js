// Official service destinations, reviewed 8 November 2026.
// These are websites, never direct video streams or IPTV catch-up templates.
export const CATCH_UP_SERVICES = [
  ['bbc', 'BBC iPlayer', 'United Kingdom', 'Europe', 'English', 'https://www.bbc.co.uk/iplayer', 'BBC programmes. BBC account and TV Licence required.'],
  ['itvx', 'ITVX', 'United Kingdom', 'Europe', 'English', 'https://www.itv.com/', 'ITV catch-up and box sets. Free and premium content.'],
  ['channel4', 'Channel 4', 'United Kingdom', 'Europe', 'English', 'https://www.channel4.com/', 'Channel 4, E4, More4 and Film4 programmes.'],
  ['five', '5', 'United Kingdom', 'Europe', 'English', 'https://www.5.tv/', 'Channel 5 family catch-up, formerly My5.'],
  ['u', 'U', 'United Kingdom', 'Europe', 'English', 'https://u.co.uk/', 'U&Dave, U&Drama, U&W and U&Yesterday programmes.'],
  ['stv', 'STV Player', 'United Kingdom', 'Europe', 'English', 'https://player.stv.tv/', 'STV programmes and drama box sets.'],
  ['francetv', 'france.tv', 'France', 'Europe', 'French', 'https://www.france.tv/', 'France Télévisions programmes and replays.'],
  ['arte', 'ARTE', 'France / Germany', 'Europe', 'Multilingual', 'https://www.arte.tv/', 'Documentaries, drama, culture and concerts.'],
  ['ard', 'ARD Mediathek', 'Germany', 'Europe', 'German', 'https://www.ardmediathek.de/', 'ARD programmes, films and documentaries.'],
  ['zdf', 'ZDF', 'Germany', 'Europe', 'German', 'https://www.zdf.de/', 'ZDF series, films and programme replays.'],
  ['rai', 'RaiPlay', 'Italy', 'Europe', 'Italian', 'https://www.raiplay.it/', 'Rai programmes, drama and entertainment.'],
  ['rtve', 'RTVE Play', 'Spain', 'Europe', 'Spanish', 'https://www.rtve.es/play/', 'RTVE programmes. International catalogue and terms differ.'],
  ['rtp', 'RTP Play', 'Portugal', 'Europe', 'Portuguese', 'https://www.rtp.pt/play/', 'RTP programmes and Portuguese entertainment.'],
  ['svt', 'SVT Play', 'Sweden', 'Europe', 'Swedish', 'https://www.svtplay.se/', 'SVT programmes; selected titles available abroad.'],
  ['yle', 'Yle Areena', 'Finland', 'Europe', 'Finnish / Swedish', 'https://areena.yle.fi/tv', 'Yle television programmes and documentaries.'],
  ['pbs', 'PBS', 'United States', 'North America', 'English', 'https://www.pbs.org/', 'PBS programmes. Some titles require station membership.'],
  ['cbc', 'CBC Gem', 'Canada', 'North America', 'English', 'https://gem.cbc.ca/', 'CBC catch-up. Free and premium options.'],
  ['globo', 'Globoplay', 'Brazil', 'South America', 'Portuguese', 'https://globoplay.globo.com/', 'Globo programmes and novelas. Subscription may be required.'],
  ['tver', 'TVer', 'Japan', 'Asia', 'Japanese', 'https://tver.jp/', 'Japanese broadcaster catch-up programmes.'],
  ['mewatch', 'mewatch', 'Singapore', 'Asia', 'English / Chinese / Malay / Tamil', 'https://www.mewatch.sg/', 'Mediacorp programmes and on-demand entertainment.'],
  ['shahid', 'Shahid', 'Middle East / North Africa', 'Middle East & Africa', 'Arabic', 'https://shahid.mbc.net/', 'MBC programmes and Arabic series. Free and subscription content.'],
  ['sabc', 'SABC+', 'South Africa', 'Middle East & Africa', 'Multilingual', 'https://sabc-plus.com/', 'SABC catch-up and on-demand programmes.'],
  ['abc', 'ABC iview', 'Australia', 'Oceania', 'English', 'https://iview.abc.net.au/', 'ABC catch-up. Account required for on-demand viewing.'],
  ['sbs', 'SBS On Demand', 'Australia', 'Oceania', 'Multilingual', 'https://www.sbs.com.au/ondemand/', 'SBS programmes, international drama and films.'],
  ['seven', '7plus', 'Australia', 'Oceania', 'English', 'https://7plus.com.au/', 'Seven network catch-up and on-demand programmes.'],
  ['nine', '9Now', 'Australia', 'Oceania', 'English', 'https://www.9now.com.au/', 'Nine network catch-up and box sets.'],
  ['tvnz', 'TVNZ+', 'New Zealand', 'Oceania', 'English', 'https://www.tvnz.co.nz/', 'TVNZ shows, films and catch-up. Account required.'],
  ['tv5', 'TV5MONDE+', 'International', 'International', 'French / Multilingual subtitles', 'https://www.tv5mondeplus.com/', 'French-language programmes, films and documentaries.'],
].map(([id, name, country, region, language, url, description]) => ({
  id, name, country, region, language, url, description,
}));

export function filterCatchUpServices({ query = '', region = '', country = '' } = {}) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return CATCH_UP_SERVICES.filter(service => {
    const text = [service.name, service.country, service.region, service.language, service.description].join(' ').toLocaleLowerCase();
    return (!region || service.region === region) && (!country || service.country === country) && terms.every(term => text.includes(term));
  });
}
