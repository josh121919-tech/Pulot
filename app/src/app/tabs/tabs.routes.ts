import type { Routes } from '@angular/router';

import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'items',
        loadComponent: () => import('../items/items.page').then((m) => m.ItemsPage),
      },
      {
        path: 'report',
        loadComponent: () => import('../report/report.page').then((m) => m.ReportPage),
      },
      {
        path: '',
        redirectTo: '/items',
        pathMatch: 'full',
      },
    ],
  },
];
