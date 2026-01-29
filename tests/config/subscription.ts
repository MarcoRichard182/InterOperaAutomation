export type SolutionKey = 'corporate' | 'ri' | 'smm' | 'srec';

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
      corporate: ['Accounting', 'Finance', 'Asset Management', 'Asset Operations'],
      ri: ['Integrated Intelligence', 'Market Research'],
      smm: ['Sales & Strategic Partnerships', 'Product Management'],
      srec: ['Compliance'],
    },
  },
  {
    client: 'EY',
    email: 'testing.ey@sg.ey.com',
    solutions: {
      corporate: ['Accounting', 'Finance', 'Asset Management'],
      srec: ['Compliance'],
    },
  },
  {
    client: 'Blitz',
    email: 'blitz.testing@blitz-asset.com',
    solutions: {
      corporate: ['Accounting', 'Finance', 'Asset Management', 'HR', 'Asset Operations'],
      ri: ['Integrated Intelligence', 'Market Research'],
      srec: ['Compliance'],
    },
  },
  {
    client: 'SQE',
    email: 'sinarmas.testing@smma.id',
    solutions: {
      srec: ['Compliance'],
    },
  },
  {
    client: 'SNG',
    email: 'snggroup.testing@thesnggroup.com',
    solutions: {
      corporate: ['Accounting', 'Finance', 'Asset Management', 'Proprietary Assets'],
      ri: ['Integrated Intelligence', 'Market Research'],
    },
  },
  {
    client: 'JSI',
    email: 'jinsung.testing@sscem.com',
    solutions: {
      corporate: ['Accounting', 'Finance', 'Asset Management'],
      ri: ['Integrated Intelligence', 'Market Research'],
      smm: ['Sales & Strategic Partnerships', 'Product Management'],
    },
  },
  {
    client: 'ChungHan',
    email: 'testing@chtax.co.kr',
    solutions: {
      corporate: ['Accounting', 'Finance', 'Asset Management', 'Asset Operations'],
      srec: ['Compliance'],
    },
  },
];
