// tests/config/module-registry.ts
export type ModuleDef = {
  name: string;      // The text to look for in the top menu
  panelName: string; // The text to look for in the side panel
  href: string;      // The expected URL
  urlMatch: RegExp;  // Regex for verification
};

export const MODULE_REGISTRY: Record<string, ModuleDef> = {
  // --- ORIGINAL KEYS (Do not modify/remove to keep other tests working) ---
  
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
    urlMatch: /\/srec(-new)?\/compliance/i,
  },


  // --- NEW ADDITIONS (For Subscription Checks) ---

  // Home Modules
  'AI Hub': {
    name: 'AI Hub',
    panelName: 'AI Hub',
    href: '/home/ai-hub',
    urlMatch: /\/home\/ai-hub/i,
  },
  'AI Organisation': {
    name: 'AI Organisation',
    panelName: 'AI Organisation',
    href: '/home/ai-organisation',
    urlMatch: /\/home\/ai-organisation/i,
  },
  'Data Management': {
    name: 'Data Management',
    panelName: 'Data Management',
    href: '/home/data-management',
    urlMatch: /\/home\/data-management/i,
  },
  'Home Scheduler': {
    name: 'Scheduler',
    panelName: 'Scheduler',
    href: '/home/scheduler',
    urlMatch: /\/home\/scheduler/i,
  },

  // Solution Overviews & Schedulers
  'Corporate Overview': {
    name: 'Overview',
    panelName: 'Overview',
    href: '/corporate',
    urlMatch: /\/corporate/i,
  },
  'Corporate Scheduler': {
    name: 'Scheduler',
    panelName: 'Scheduler',
    href: '/corporate/scheduler',
    urlMatch: /\/corporate\/scheduler/i,
  },

  'RI Overview': {
    name: 'Overview',
    panelName: 'Overview',
    href: '/ri/overview',
    urlMatch: /\/ri\/overview/i,
  },
  'RI Scheduler': {
    name: 'Scheduler',
    panelName: 'Scheduler',
    href: '/ri/scheduler',
    urlMatch: /\/ri\/scheduler/i,
  },

  'SMM Overview': {
    name: 'Overview',
    panelName: 'Overview',
    href: '/smm/overview',
    urlMatch: /\/smm\/overview/i,
  },
  'SMM Scheduler': {
    name: 'Scheduler',
    panelName: 'Scheduler',
    href: '/smm/scheduler',
    urlMatch: /\/smm\/scheduler/i,
  },

  'ESG Overview': {
    name: 'Overview',
    panelName: 'Overview',
    href: '/srec-new/overview',
    urlMatch: /\/srec(-new)?\/overview/i,
  },
  'ESG Scheduler': {
    name: 'Scheduler',
    panelName: 'Scheduler',
    href: '/srec-new/scheduler',
    urlMatch: /\/srec(-new)?\/scheduler/i,
  },

  // Variants / Aliases (Mapping user's specific names to existing modules)
  'Asset Operations (Real estate)': {
    name: 'Asset Operations',
    panelName: 'Assets Operations',
    href: '/corporate/asset-operations',
    urlMatch: /\/corporate\/asset-operations/i,
  },
  'Asset Operations (Stocks & Capital Market)': {
    name: 'Asset Operations',
    panelName: 'Assets Operations',
    href: '/corporate/asset-operations',
    urlMatch: /\/corporate\/asset-operations/i,
  },

  'Integrated research (Real Estate)': {
    name: 'Integrated Intelligence',
    panelName: 'Integrated Intelligence',
    href: '/ri/integrated-intelligence',
    urlMatch: /\/ri\/integrated-intelligence/i,
  },
  'Integrated research (Stocks & Capital Market)': {
    name: 'Integrated Intelligence',
    panelName: 'Integrated Intelligence',
    href: '/ri/integrated-intelligence',
    urlMatch: /\/ri\/integrated-intelligence/i,
  },
  'Integrated research (Commodities)': {
    name: 'Integrated Intelligence',
    panelName: 'Integrated Intelligence',
    href: '/ri/integrated-intelligence',
    urlMatch: /\/ri\/integrated-intelligence/i,
  },

  'Market Research (Real estate)': {
    name: 'Market Research',
    panelName: 'Market Research',
    href: '/ri/market-research-new',
    urlMatch: /\/ri\/market-research/i,
  },
  'Market Research (Stocks & Capital Market)': {
    name: 'Market Research',
    panelName: 'Market Research',
    href: '/ri/market-research-new',
    urlMatch: /\/ri\/market-research/i,
  },
  'Market Research (Commodities)': {
    name: 'Market Research',
    panelName: 'Market Research',
    href: '/ri/market-research-new',
    urlMatch: /\/ri\/market-research/i,
  },
  
  // User list had "Sales & Strategic Partnership" (singular), registry had "Partnerships" (plural)
  'Sales & Strategic Partnership': {
    name: 'Sales & Strategic Partnerships',
    panelName: 'Sales & Strategic Partnerships',
    href: '/smm/sales-strategic-partnership',
    urlMatch: /\/smm\/sales-strategic-partnership/i,
  },
  // User list had "Product management" (lowercase m), registry had "Management"
  'Product management': {
    name: 'Product Management',
    panelName: 'Product Management',
    href: '/smm/products',
    urlMatch: /\/smm\/products/i,
  },
};