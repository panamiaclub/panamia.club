export interface DirectoryBusiness {
  id: string;
  name: string;
  category: string;
  location: string;
  owner: string;
  email: string;
  phone: string;
  joined: string;
  active: boolean;
  screenname?: string | null;
}

export interface DirectoryRoster {
  businesses: DirectoryBusiness[];
  asOf: string;
}

export function isNewDirectoryBusiness(
  business: DirectoryBusiness,
  asOf: string
) {
  const age = Date.parse(asOf) - Date.parse(business.joined);
  return age >= 0 && age < 30 * 24 * 60 * 60 * 1000;
}

export function businessCsv(businesses: readonly DirectoryBusiness[]) {
  const cell = (value: string) => {
    // Imported contact fields must not become spreadsheet formulas.
    const text = /^\s*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = businesses.map((business) => [
    business.name,
    business.category,
    business.location,
    business.owner,
    business.email,
    business.phone,
    business.joined,
    business.active ? 'Active' : 'Inactive',
  ]);
  return [
    [
      'Business',
      'Category',
      'Location',
      'Owner',
      'Email',
      'Phone',
      'Date added',
      'Status',
    ],
    ...rows,
  ]
    .map((row) => row.map(cell).join(','))
    .join('\r\n');
}
