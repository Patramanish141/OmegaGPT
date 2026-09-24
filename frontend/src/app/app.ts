import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Toasts } from './shared/toast/toasts';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  imports: [RouterOutlet, Toasts],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
