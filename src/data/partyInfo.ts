/**
 * Beginner-friendly party profiles. Written to be neutral and factual; leadership as of September 2026.
 * Sources: party websites, Wikipedia party articles, Elections Department results.
 */
export interface PartyInfo {
  founded: string
  leaders: string
  /** plain-English position on the left–right spectrum */
  position: string
  ideology: string
  summary: string
  themes: string[]
}

export const PARTY_INFO: Record<string, PartyInfo> = {
  PAP: {
    founded: '1954 (founders included Lee Kuan Yew)',
    leaders: 'Secretary-General: Lawrence Wong (Prime Minister) · Chairman: Desmond Lee',
    position: 'Centre-right',
    ideology: 'Pragmatism, conservatism, economic liberalism, multiracialism',
    summary: "Singapore's governing party since 1959, in power at every election since. It started on the centre-left and moved towards the centre-right in the 1960s. It emphasises long-term planning, economic growth and stability.",
    themes: ['Jobs and economic growth', 'Public housing (HDB) and CPF savings', 'Racial and religious harmony', 'Strong defence and security'],
  },
  WP: {
    founded: '1957 (by David Marshall)',
    leaders: 'Secretary-General: Pritam Singh · Chair: Sylvia Lim',
    position: 'Centre-left',
    ideology: 'Social democracy',
    summary: "Singapore's oldest and largest opposition party, and the only one besides the PAP with elected MPs today. It won Hougang in 1991, Aljunied GRC in 2011 (the first opposition GRC win) and Sengkang GRC in 2020. It presents itself as a check and balance in Parliament. Pritam Singh ceased to be Leader of the Opposition in January 2026 but remains party leader.",
    themes: ['More checks and balances in Parliament', 'Stronger social safety nets', 'Cost of living and a minimum wage', 'Political and electoral reform'],
  },
  PSP: {
    founded: '2019 (by Tan Cheng Bock, a former PAP MP)',
    leaders: 'Secretary-General: Leong Mun Wai · Chairman: A’bas Kasmani',
    position: 'Centre to centre-left',
    ideology: 'Liberalism, progressivism',
    summary: 'Founded by former PAP MP and presidential candidate Tan Cheng Bock. It came close in West Coast in 2020 and had two Non-Constituency MPs from 2020 to 2025. It won no seats in 2025.',
    themes: ['Cost of living and GST', 'Jobs for Singaporeans', 'Transparency and accountability', 'Use of national reserves'],
  },
  SDP: {
    founded: '1980 (by Chiam See Tong)',
    leaders: 'Secretary-General: Chee Soon Juan · Chairman: Paul Tambyah',
    position: 'Centre-left',
    ideology: 'Social liberalism, social democracy',
    summary: 'One of the older opposition parties. It won three seats in 1991 but has had no MPs since 1997. It is known for detailed policy papers. In 2025 Chee Soon Juan came within 1,500 votes of winning Sembawang West.',
    themes: ['Healthcare reform (single-payer system)', 'Civil liberties and constitutional reform', 'Retirement adequacy and CPF', 'Social welfare'],
  },
  RDU: {
    founded: '2020 (by Ravi Philemon and Michelle Lee, formerly of PSP)',
    leaders: 'Secretary-General: Ravi Philemon · Chairman: David Foo',
    position: 'Centre-left',
    ideology: 'Social democracy, progressivism',
    summary: 'A young party formed by former PSP members. Its best result so far was 26% in Nee Soon GRC in 2025.',
    themes: ['Cost of living', "Workers' rights", 'Inclusiveness', 'Open and transparent government'],
  },
  SDA: {
    founded: '2001 (an alliance of parties)',
    leaders: 'Chairman: Desmond Lim · Secretary-General: Abu bin Mohamed',
    position: 'Opposition alliance',
    ideology: 'Motto "Service Before Self"',
    summary: 'An alliance of smaller parties, now the Singapore Justice Party and the Singapore Malay National Organisation (PKMS). It has regularly contested Pasir Ris and won 32% there in 2025.',
    themes: ['Careful government spending', 'Help with healthcare costs', 'Rent control'],
  },
  SPP: {
    founded: '1994 (breakaway from SDP)',
    leaders: 'Secretary-General: Steve Chia · Chairman: Melvyn Chiu',
    position: 'Centrist opposition',
    ideology: 'Liberal democracy',
    summary: 'Best known for veteran opposition MP Chiam See Tong, who held Potong Pasir from 1984 to 2011. It has not won a seat since 2011.',
    themes: ['Constructive opposition', 'Local town and estate issues', 'Potong Pasir and Bishan–Toa Payoh'],
  },
  PAR: {
    founded: '2023 (an alliance)',
    leaders: 'Secretary-General: Lim Tean · Chairman: Mohamad Hamim Aliyas',
    position: 'Opposition alliance',
    ideology: 'Populism',
    summary: "An alliance led by lawyer Lim Tean's Peoples Voice, now with the Democratic Progressive Party. It contested six constituencies in 2025 and won 2.5% of the national vote.",
    themes: ['Cost of living', 'Singaporeans first in jobs', 'Lower taxes and fees'],
  },
  SUP: {
    founded: '2020 (by Andy Zhu, formerly of the Reform Party)',
    leaders: 'Secretary-General: Andy Zhu',
    position: 'Opposition',
    ideology: 'No developed manifesto yet',
    summary: 'A small party that contested Ang Mo Kio GRC in 2025, winning about 11% of the vote.',
    themes: ['Bread-and-butter issues', "Women's rights"],
  },
  PPP: {
    founded: '2015 (by Goh Meng Seng)',
    leaders: 'Secretary-General: William Lim',
    position: 'Opposition',
    ideology: 'Socially conservative',
    summary: 'A small party that contested Ang Mo Kio and Tampines GRCs in 2025 and lost its deposits in both.',
    themes: ['Socially conservative stances', 'Cost of living'],
  },
  NSP: {
    founded: '1987',
    leaders: 'Secretary-General: Spencer Ng · President: Reno Fong',
    position: 'Centre',
    ideology: 'Centrism',
    summary: "One of Singapore's longer-standing opposition parties. It had a very weak result in 2025, when its Tampines team won 0.18%, the lowest share in Singapore's election history.",
    themes: ['Fair competition', 'A minimum wage', 'Opposes "trickle-down" economics'],
  },
  IND: {
    founded: '—',
    leaders: 'No party',
    position: 'Varies',
    ideology: 'Individual views',
    summary: 'Independents stand without any party. In 2025 two independents stood, in Mountbatten (36%) and Radin Mas (24%).',
    themes: ['Each candidate sets their own platform'],
  },
}
