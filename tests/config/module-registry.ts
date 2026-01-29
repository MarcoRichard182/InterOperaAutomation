export type ModuleDef = {
  name: string;
  panelName: string;
  href: string;
  urlMatch: RegExp;
};

export const MODULE_REGISTRY: Record<string, ModuleDef> = {
  // Corporate
  Accounting: {
    name: 'Accounting',
    panelName: 'Accounting',
    href: '/corporate/accounting',
    urlMatch: /\/corporate\/accounting/i,
  },
  Finance: {
    name: 'Finance',
    panelName: 'Finance',
    href: '/corporate/finance',
    urlMatch: /\/corporate\/finance/i,
  },
  'Asset Management': {
    name: 'Asset Management',
    panelName: 'Assets Management',
    href: '/corporate/asset-management',
    urlMatch: /\/corporate\/asset-management/i,
  },
  'Asset Operations': {
    name: 'Asset Operations',
    panelName: 'Assets Operations',
    href: '/corporate/asset-operations',
    urlMatch: /\/corporate\/asset-operations/i,
  },
  HR: {
    name: 'HR',
    panelName: 'Human Resources (HR)',
    href: '/corporate/hr',
    urlMatch: /\/corporate\/hr/i,
  },
  'Proprietary Assets': {
    name: 'Proprietary Assets',
    panelName: 'Proprietary Assets',
    href: '/corporate/proprietary-assets',
    urlMatch: /\/corporate\/proprietary-assets/i,
  },

  // RI
  'Integrated Intelligence': {
    name: 'Integrated Intelligence',
    panelName: 'Integrated Intelligence',
    href: '/ri/integrated-intelligence',
    urlMatch: /\/ri\/integrated-intelligence/i,
  },
  'Market Research': {
    name: 'Market Research',
    panelName: 'Market Research',
    href: '/ri/market-research-new',
    urlMatch: /\/ri\/market-research/i,
  },

  // SMM
  'Sales & Strategic Partnerships': {
    name: 'Sales & Strategic Partnerships',
    panelName: 'Sales & Strategic Partnerships',
    href: '/smm/sales-strategic-partnership',
    urlMatch: /\/smm\/sales-strategic-partnership/i,
  },
  'Product Management': {
    name: 'Product Management',
    panelName: 'Product Management',
    href: '/smm/products',
    urlMatch: /\/smm\/products/i,
  },

  // ESG
  Compliance: {
    name: 'Compliance',
    panelName: 'Compliance',
    href: '/srec/compliance',
    urlMatch: /\/srec\/compliance/i,
  },
};
