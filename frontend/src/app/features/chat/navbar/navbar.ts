import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/** Presentational top bar: brand, user chip and the account dropdown. */
@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Navbar {
  readonly username = input<string | null>(null);
  readonly logout = output<void>();

  // Purely local UI state, so it stays in the presentational component.
  readonly menuOpen = signal(false);

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  onLogout(): void {
    this.menuOpen.set(false);
    this.logout.emit();
  }
}
