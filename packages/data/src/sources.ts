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
    id: 'aiaa-envelope-permeation',
    title: 'Helium permeation through flexible aerostat and stratospheric airship envelope laminates',
    author: 'Various; see docs/derivations/permeation.md for the individual papers',
    note: 'COMPILATION of several published measurements: a K5 para-aramid laminate at 0.04 L/(m2 day) helium, multi-ply polyester and Tedlar envelopes quoted as below 1 L/(m2 day), and laminate studies reporting 0.4 to 8.0 cc/(m2 day atm). EVERY figure in this body of work is for HELIUM. No hydrogen measurement on an airship-grade laminate appears to have been published, which is why the hydrogen entries in packages/data/src/materials/films.ts are Uncertain rather than Measured.',
  },
  {
    id: 'buck-1981',
    title: 'New equations for computing vapor pressure and enhancement factor',
    author: 'A. L. Buck',
    year: 1981,
    note: 'J. Appl. Meteorol. 20, 1527-1532. Saturation vapour pressure over liquid water, better than 0.1 percent from -20 to +50 C. Used for the humidity correction to air density, which is the term most often left out of airship lift models.',
  },
  {
    id: 'toray-t700s',
    title: 'TORAYCA T700S Standard Modulus Carbon Fiber Data Sheet',
    author: 'Toray Composite Materials America',
    note: 'MANUFACTURER DATASHEET. Fibre and composite properties. The composite rows are normalised to 60 percent fibre volume with a 130 C epoxy cure, which is NOT what hand wet layup achieves; see packages/data/src/materials/composites.ts for the knockdown chain.',
  },
  {
    id: 'toray-m46j',
    title: 'TORAYCA M46J High Modulus Carbon Fiber Data Sheet',
    author: 'Toray Composite Materials America',
    note: 'MANUFACTURER DATASHEET. Source of the finding that high modulus fibre has 25 percent LOWER composite compressive strength than standard modulus, which is why it loses for a buckling-critical frame.',
  },
  {
    id: 'toray-technical-manual',
    title: 'TORAYCA Technical Manual, Rev. 4/28/2020',
    author: 'Toray',
    note: 'MANUFACTURER COMPILATION. Typical fibre properties across the product range.',
  },
  {
    id: 'hexcel-8552',
    title: 'HexPly 8552 Epoxy Matrix Product Data Sheet (2023)',
    author: 'Hexcel',
    note: 'MANUFACTURER DATASHEET. Used here for something it was not written for: its unidirectional and woven rows use the same fibre and the same resin, so normalising both to aligned fibre volume isolates the crimp effect. That is where the finding that woven is BETTER in compression comes from.',
  },
  {
    id: 'gurit-guide-to-composites',
    title: 'Guide to Composites, document GTC-1-1098',
    author: 'SP Systems (now Gurit)',
    note: 'MANUFACTURER GUIDE. Fibre volume fraction achieved by hand layup without a vacuum bag.',
  },
  {
    id: 'sussmann-2018',
    title: 'Fabrication of high quality, large wet lay-up/vacuum bag laminates',
    author: 'Sussmann, Amirkhosravi, Pishvar and Altan',
    year: 2018,
    note: 'PRIMARY. Polymers 10(9):992. Measured fibre volume fraction and void content for wet layup under vacuum bag. Laboratory panels made by researchers, so the figures are an upper bound on what a non-specialist achieves at production scale.',
  },
  {
    id: 'judd-wright-1978',
    title: 'Voids and their effects on the mechanical properties of composites: an appraisal',
    author: 'N. C. W. Judd and W. W. Wright',
    year: 1978,
    note: 'PRIMARY. SAMPE Journal 14. Interlaminar shear strength falls about 7 percent per 1 percent of voids, while fibre-dominated properties are untouched. This is why the cost of hand layup lands on the joints rather than on the members.',
  },
  {
    id: 'proset-lam125',
    title: 'PRO-SET LAM-125 / LAM-226 Laminating Epoxy Technical Data, Rev 3',
    author: 'Wessex Resins and Adhesives',
    year: 2018,
    note: 'MANUFACTURER DATASHEET. Tracks one resin across five cure schedules, which is what makes the 32 K Tg gain from post-cure visible.',
  },
  {
    id: 'gougeon-105',
    title: '105 Epoxy Resin / 206 Slow Hardener Technical Data Sheet',
    author: 'Gougeon Brothers',
    year: 2014,
    note: 'MANUFACTURER DATASHEET. The default marine epoxy, and the temperature analysis rules it out for primary structure on this vehicle.',
  },
  {
    id: 'faa-ps-ace-100-2-18',
    title: 'Policy on acceptability of temperature differential between wet glass transition temperature and maximum operating temperature, PS-ACE-100-2-18-1999',
    author: 'FAA',
    year: 1999,
    note: 'REGULATORY. Maximum operating temperature must sit at least 28 K below WET Tg. This is a requirement rather than an engineering estimate, and it is what turns a resin choice into a design constraint.',
  },
  {
    id: 'wright-1981',
    title: 'The effect of diffusion of water into epoxy resins and their carbon fibre reinforced composites',
    author: 'W. W. Wright',
    year: 1981,
    note: 'PRIMARY, but a rule of thumb. Composites 12(3). Wet Tg falls roughly 20 K per percent absorbed moisture, drawn across several studies and described as approximate by its own author. Carries real uncertainty and it multiplies straight into the operating temperature limit.',
  },
  {
    id: 'colin-verdu',
    title: 'Humid ageing of organic matrix composites, in Durability of Composites in a Marine Environment',
    author: 'X. Colin and J. Verdu',
    note: 'PRIMARY REVIEW. Epoxy saturation moisture uptake, below about 3 percent.',
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
