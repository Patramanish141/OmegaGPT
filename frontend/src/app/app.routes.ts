import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
    title: 'Sign in · OmegaChat',
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/signup/signup').then((m) => m.Signup),
    title: 'Sign up · OmegaChat',
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/chat/chat-page/chat-page').then((m) => m.ChatPage),
    title: 'OmegaChat',
  },
  { path: '**', redirectTo: '' },
];
