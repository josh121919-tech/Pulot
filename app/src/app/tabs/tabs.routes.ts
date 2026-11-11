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
        data: { status: 'open' },
      },
      {
        // The same list page, showing only reports whose owner got the item back.
        path: 'resolved',
        loadComponent: () => import('../items/items.page').then((m) => m.ItemsPage),
        data: { status: 'resolved' },
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
