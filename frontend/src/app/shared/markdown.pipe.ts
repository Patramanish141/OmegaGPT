import { Pipe, PipeTransform } from '@angular/core';

import { renderMarkdown } from './markdown';

/** `{{ content | markdown }}` -> HTML string, for [innerHTML] binding. */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return renderMarkdown(value);
  }
}
