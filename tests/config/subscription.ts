export type SolutionKey = 'home' | 'corporate' | 'ri' | 'smm' | 'srec';

export type ClientSubscription = {
  client: string;
  email: string;
  solutions: Partial<Record<SolutionKey, string[]>>;
};

export const CLIENTS: ClientSubscription[] = [
  {
    client: 'Innspire',
    email: 'innspire.testing@innspirecapital.com',
    solutions: {
      home: ['AI Hub', 'AI Organisation', 'Home Scheduler', 'Data Management'],
      corporate: [
        'Corporate Overview',
        'Accounting',
        'Finance',
        'Asset Management',
        'Asset Operations (Real estate)',
        'Corporate Scheduler'
      ],
      ri: [
        'RI Overview',
        'Integrated research (Real Estate)',
        'Market Research (Real estate)',
        'RI Scheduler'
      ],
      smm: [
        'SMM Overview',
        'Sales & Strategic Partnership',
        'Product management',
        'SMM Scheduler'
      ],
      srec: [
        'ESG Overview',
        'Compliance',
        'ESG Scheduler'
      ]
    },
  },
  {
    client: 'EY',
    email: 'testing.ey@sg.ey.com',
    solutions: {
      home: ['AI Hub', 'AI Organisation', 'Home Scheduler', 'Data Management'],
      corporate: [
        'Corporate Overview',
        'Accounting',
        'Finance',
        'Asset Management',
        'Corporate Scheduler'
      ],
      srec: [
        'ESG Overview',
        'Compliance',
        'ESG Scheduler'
      ]
    },
  },
  {
    client: 'Blitz',
    email: 'blitz.testing@blitz-asset.com',
    solutions: {
      home: ['AI Hub', 'AI Organisation', 'Home Scheduler', 'Data Management'],
      corporate: [
        'Corporate Overview',
        'Accounting',
        'Finance',
        'Asset Management',
        'HR',
        'Asset Operations (Stocks & Capital Market)',
        'Corporate Scheduler'
      ],
      ri: [
        'RI Overview',
        'Integrated research (Stocks & Capital Market)',
        'Market Research (Stocks & Capital Market)',
        'RI Scheduler'
      ],
      srec: [
        'ESG Overview',
        'Compliance',
        'ESG Scheduler'
      ]
    },
  },
  {
    client: 'SQE',
    email: 'sinarmas.testing@smma.id',
    solutions: {
      home: ['AI Hub', 'AI Organisation', 'Home Scheduler', 'Data Management'],
      srec: [
        'ESG Overview',
        'Compliance',
        'ESG Scheduler'
      ]
    },
  },
  {
    client: 'SNG',
    email: 'snggroup.testing@thesnggroup.com',
    solutions: {
      home: ['AI Hub', 'AI Organisation', 'Home Scheduler', 'Data Management'],
      corporate: [
        'Corporate Overview',
        'Accounting',
        'Finance',
        'Asset Management',
        'Proprietary Assets',
        'Corporate Scheduler'
      ],
      ri: [
        'RI Overview',
        'Integrated research (Stocks & Capital Market)',
        'Market Research (Stocks & Capital Market)',
        'RI Scheduler'
      ]
    },
  },
  {
    client: 'JSI',
    email: 'jinsung.testing@sscem.com',
    solutions: {
      home: ['AI Hub', 'AI Organisation', 'Home Scheduler', 'Data Management'],
      corporate: [
        'Corporate Overview',
        'Accounting',
        'Finance',
        'Asset Management',
        'Corporate Scheduler'
      ],
      ri: [
        'RI Overview',
        'Integrated research (Commodities)',
        'Market Research (Commodities)',
        'RI Scheduler'
      ],
      smm: [
        'SMM Overview',
        'Sales & Strategic Partnership',
        'Product management',
        'SMM Scheduler'
      ]
    },
  },
  {
    client: 'ChungHan',
    email: 'testing@chtax.co.kr',
    solutions: {
      home: ['AI Hub', 'AI Organisation', 'Home Scheduler', 'Data Management'],
      corporate: [
        'Corporate Overview',
        'Accounting',
        'Finance',
        'Asset Management',
        'Asset Operations (Stocks & Capital Market)',
        'Corporate Scheduler'
      ],
      srec: [
        'ESG Overview',
        'Compliance',
        'ESG Scheduler'
      ]
    },
  },
];