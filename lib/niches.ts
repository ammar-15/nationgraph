export type Niche = {
  id: string;
  label: string;
  buyers: string;
  vendorsDescription: string;
  keywords: string[];
  searchHints: string[];
};

export const NICHES: Niche[] = [
  {
    id: "k12",
    label: "K-12 EdTech",
    buyers: "K-12 school districts, county offices of education, state education agencies",
    vendorsDescription:
      "companies selling software, curriculum, devices, safety, transportation or student services to K-12 districts",
    keywords: ["school", "district", "student", "education", "curriculum", "chromebook", "learning", "classroom", "k-12"],
    searchHints: [
      "school board agenda approves study of curriculum software replacement",
      "school board approves contract renewal edtech",
      "school board discusses replacing student information system budget",
      "district technology plan expiring contract",
    ],
  },
  {
    id: "public-safety",
    label: "Public Safety Tech",
    buyers: "police departments, sheriffs, fire departments, 911 / emergency communications centers",
    vendorsDescription: "companies selling body cameras, CAD/RMS, fire software, drones, records and dispatch tools",
    keywords: ["police", "sheriff", "fire", "911", "dispatch", "body camera", "public safety", "emergency"],
    searchHints: [
      "city council body camera contract expiring",
      "police department records management system aging replacement budget request city council",
      "fire department CAD system end of life city council funding discussion",
    ],
  },
  {
    id: "transit",
    label: "Transit & Fleet",
    buyers: "transit agencies, public works and fleet departments, MPOs",
    vendorsDescription: "companies selling fleet telematics, fare collection, scheduling and transit software",
    keywords: ["transit", "bus", "fleet", "fare", "paratransit", "vehicle", "transportation"],
    searchHints: [
      "transit agency board fare collection system replacement funding approved",
      "city fleet telematics contract renewal council",
    ],
  },
  {
    id: "gov-software",
    label: "Municipal Software",
    buyers: "city and county governments: IT, finance, permitting, clerks, utilities",
    vendorsDescription: "companies selling ERP, permitting, utility billing, 311, cybersecurity and records software",
    keywords: ["software", "license", "erp", "permitting", "cybersecurity", "utility billing", "technology", "subscription"],
    searchHints: [
      "city council approves software contract renewal 2026",
      "county commissioners permitting software replacement budget workshop",
      "city council cybersecurity incident response funding discussion",
    ],
  },
];

export const getNiche = (id: string) => NICHES.find((n) => n.id === id) ?? NICHES[0];
