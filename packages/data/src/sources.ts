import type { Source } from './citation.js'

/**
 * The bibliography.
 *
 * Everything in this repository traces back to an entry here. The website
 * renders this list, and a `Measured` whose `source` does not resolve to one of
 * these ids fails the data integrity test.
 *
 * Preference order, highest first: a standards body or national metrology
 * institute, a primary technical report, a manufacturer datasheet, a textbook,
 * a secondary compilation. Where only a secondary compilation exists the `note`
 * says so, because "airships.net says" and "NIST says" are not the same claim
 * and the model should not pretend otherwise.
 */
export const SOURCES: readonly Source[] = [
  {
    id: 'si-2019',
    title: 'The International System of Units (SI), 9th edition',
    author: 'BIPM',
    year: 2019,
    url: 'https://www.bipm.org/en/publications/si-brochure',
    note: 'The 2019 redefinition fixed the gas constant and Boltzmann constant exactly. Constants sourced here have zero uncertainty by definition, not by measurement.',
  },
  {
    id: 'icao-doc7488',
    title: 'Manual of the ICAO Standard Atmosphere, extended to 80 km, Doc 7488/3',
    author: 'ICAO',
    year: 1993,
    note: 'The defining document for ISA. Note it fixes the universal gas constant at 8.31432 J/(mol K), which is NOT the modern SI value. Reproducing the published ISA tables requires the ISA value; using the 2019 SI value shifts density by about 25 ppm. Both are in the model, deliberately separated.',
  },
  {
    id: 'us-std-atm-1976',
    title: 'U.S. Standard Atmosphere, 1976',
    author: 'NOAA / NASA / USAF',
    year: 1976,
    url: 'https://ntrs.nasa.gov/citations/19770009539',
    note: 'Identical to ISA below 32 km. Source of the tabulated values the atmosphere validation gate checks against.',
  },
  {
    id: 'nist-webbook',
    title: 'NIST Chemistry WebBook, SRD 69',
    author: 'NIST',
    url: 'https://webbook.nist.gov/chemistry/',
    note: 'Thermophysical properties of hydrogen, helium, water and air, including real-gas compressibility from the Leachman (H2) and McCarty (He) equations of state.',
  },
  {
    id: 'iupac-atomic-weights-2021',
    title: 'Atomic weights of the elements 2021 (IUPAC Technical Report)',
    author: 'IUPAC',
    year: 2021,
    note: 'Standard atomic weights. Intervals rather than single values for elements with variable isotopic composition, which is why hydrogen carries a real uncertainty and helium does not.',
  },
  {
    id: 'buck-1981',
    title: 'New equations for computing vapor pressure and enhancement factor',
    author: 'A. L. Buck',
    year: 1981,
    note: 'J. Appl. Meteorol. 20, 1527-1532. Saturation vapour pressure over liquid water, better than 0.1 percent from -20 to +50 C. Used for the humidity correction to air density, which is the term most often left out of airship lift models.',
  },
  {
    id: 'khoury-airship-technology',
    title: 'Airship Technology, 2nd edition',
    author: 'G. A. Khoury (ed.)',
    year: 2012,
    note: 'The standard modern reference. Source of volumetric drag coefficient conventions, structural practice, and most airship-specific empirical relations used here.',
  },
  {
    id: 'lamb-hydrodynamics',
    title: 'Hydrodynamics, 6th edition',
    author: 'H. Lamb',
    year: 1932,
    note: 'Articles 111-114: the inertia coefficients for an ellipsoid moving in an unbounded ideal fluid. This is the source of the added mass tensor, and it is still the correct source ninety years later.',
  },
  {
    id: 'naca-tr-394',
    title: 'NACA Report 394: The aerodynamic forces on airship hulls',
    author: 'M. M. Munk',
    year: 1924,
    url: 'https://ntrs.nasa.gov/citations/19930091468',
    note: 'The Munk moment. The destabilising pitch and yaw moment on a bare hull at incidence, derived from potential flow. Fins exist because of this paper.',
  },
  {
    id: 'naca-tr-432',
    title: 'NACA Report 432: Drag of the USS Akron hull',
    author: 'NACA',
    year: 1932,
    note: 'Measured bare-hull volumetric drag coefficient of about 0.0247 for a well-formed rigid. Used as the lower sanity bound on any drag result this model produces.',
  },
  {
    id: 'faa-p-8110-2',
    title: 'FAA-P-8110-2 Change 2: Airship Design Criteria',
    author: 'FAA',
    year: 1995,
    note: 'The only airworthiness standard that exists for airships. There is no Part 23 or Part 25 equivalent; certification runs through special class 21.17(b) against this document. Its load cases are encoded as structural test cases.',
  },
  {
    id: 'doe-h2-storage-targets',
    title: 'DOE Technical Targets for Onboard Hydrogen Storage for Light-Duty Vehicles',
    author: 'US DOE Hydrogen and Fuel Cell Technologies Office',
    url: 'https://www.energy.gov/eere/fuelcells/doe-technical-targets-onboard-hydrogen-storage-light-duty-vehicles',
    note: 'Type IV COPV system gravimetric and volumetric capacity. These are SYSTEM figures including tank, valves and regulator, which is what the mass budget needs; stack-only or tank-only figures flatter the design by roughly a factor of two.',
  },
  {
    id: 'doe-fuel-cell-records',
    title: 'DOE Fuel Cell Technologies Office Records and Multi-Year Program Plan',
    author: 'US DOE',
    note: 'PEM fuel cell and electrolyzer system efficiency, specific power and degradation rates. System-level, including balance of plant.',
  },
  {
    id: 'nfpa-2',
    title: 'NFPA 2: Hydrogen Technologies Code',
    author: 'NFPA',
    note: 'Flammability limits, hazardous area classification, ventilation requirements. The quantitative basis for the safety module.',
  },
  {
    id: 'crc-handbook',
    title: 'CRC Handbook of Chemistry and Physics',
    note: 'Flammability limits, minimum ignition energy, quenching distance, laminar flame speed, diffusion coefficients.',
  },
  {
    id: 'airships-net-hindenburg',
    title: 'Hindenburg statistics',
    author: 'Airships.net (D. Grossman)',
    url: 'https://www.airships.net/hindenburg/size-speed/',
    note: 'SECONDARY compilation of Luftschiffbau Zeppelin figures. Cross-checked against Wikipedia and Dick and Robinson. Treated as +/- 3 percent, because published airship figures vary with fill fraction, purity and standard day assumptions that the sources rarely state.',
  },
  {
    id: 'airships-net-akron-macon',
    title: 'USS Akron and USS Macon',
    author: 'Airships.net (D. Grossman)',
    url: 'https://www.airships.net/us-navy-rigid-airships/uss-akron-macon/',
    note: 'SECONDARY compilation of US Navy figures. The gross lift figure of 403,000 lb is explicitly stated as being at 95 percent fill with helium of standard purity, which is unusually careful and is what makes this a usable validation case.',
  },
  {
    id: 'navsource-macon',
    title: 'Rigid Airships Photo Index: USS Macon (ZRS-5)',
    author: 'NavSource Naval History',
    url: 'https://www.navsource.org/archives/02/99/029905.htm',
    note: 'Gas volume, air displacement, useful lift and dimensions, from US Navy records.',
  },
  {
    id: 'wikipedia-lz129',
    title: 'LZ 129 Hindenburg',
    author: 'Wikipedia',
    url: 'https://en.wikipedia.org/wiki/LZ_129_Hindenburg',
    note: 'SECONDARY. Used only to cross-check the airships.net figures. Note its text calls 232 t a "useful lift" while also giving a 215 t gross weight, which cannot both be true; the model treats 232 t as GROSS lift and the validation fixture records the discrepancy rather than hiding it.',
  },
  {
    id: 'wikipedia-lz127',
    title: 'LZ 127 Graf Zeppelin',
    author: 'Wikipedia',
    url: 'https://en.wikipedia.org/wiki/LZ_127_Graf_Zeppelin',
    note: 'SECONDARY. Blau gas volume, cell count, and the buoyancy-neutrality claim. The exact Blau gas composition needs a primary source and is currently an Uncertain in the fuel module.',
  },
] as const

const byId = new Map(SOURCES.map((s) => [s.id, s]))

export const source = (id: string): Source => {
  const found = byId.get(id)
  if (!found) throw new Error(`Unknown source id "${id}". Add it to packages/data/src/sources.ts.`)
  return found
}

export const sourceExists = (id: string): boolean => byId.has(id)
