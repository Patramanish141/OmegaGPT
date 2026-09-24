import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatMessage } from '../../../core/models/chat.models';
import { MessageList } from './message-list';

describe('MessageList', () => {
  let fixture: ComponentFixture<MessageList>;
  let element: HTMLElement;

  const render = (inputs: {
    messages: ChatMessage[];
    streamingText?: string | null;
    isNewChat?: boolean;
  }) => {
    fixture.componentRef.setInput('messages', inputs.messages);
    fixture.componentRef.setInput('streamingText', inputs.streamingText ?? null);
    fixture.componentRef.setInput('isNewChat', inputs.isNewChat ?? false);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MessageList] }).compileComponents();
    fixture = TestBed.createComponent(MessageList);
    element = fixture.nativeElement as HTMLElement;
  });

  it('shows the empty state before the first message', () => {
    render({ messages: [], isNewChat: true });

    expect(element.querySelector('.empty-state h1')?.textContent).toContain('Start a new chat');
    expect(element.querySelector('.chats')).toBeNull();
  });

  it('renders a user message as plain text, not markdown', () => {
    render({ messages: [{ role: 'user', content: '**not bold**' }] });

    const bubble = element.querySelector('.userDiv .userMessage');
    expect(bubble?.textContent).toBe('**not bold**');
    expect(element.querySelector('.userDiv strong')).toBeNull();
  });

  it('renders an assistant message as markdown', () => {
    render({ messages: [{ role: 'assistant', content: 'Here is **bold** text.' }] });

    const reply = element.querySelector('.gptDiv');
    expect(reply?.querySelector('strong')?.textContent).toBe('bold');
  });

  it('keeps highlight.js classes on fenced code blocks', () => {
    render({
      messages: [{ role: 'assistant', content: '```js\nconst x = 1;\n```' }],
    });

    const code = element.querySelector('.gptDiv pre code');
    // Angular's sanitizer must preserve `class`, or syntax highlighting is lost.
    expect(code?.className).toContain('language-js');
    expect(code?.querySelector('.hljs-keyword')).not.toBeNull();
  });

  it('strips script tags out of a model reply', () => {
    render({
      messages: [{ role: 'assistant', content: 'safe <script>alert(1)</script>' }],
    });

    expect(element.querySelector('script')).toBeNull();
    expect(element.textContent).toContain('safe');
  });

  it('renders the in-flight reply with a caret below the stored messages', () => {
    render({
      messages: [{ role: 'user', content: 'hi' }],
      streamingText: 'partial rep',
    });

    const streaming = element.querySelector('.gptDiv.streaming');
    expect(streaming?.textContent).toContain('partial rep');
    expect(streaming?.querySelector('.stream-caret')).not.toBeNull();
  });

  it('shows no streaming bubble once the turn has ended', () => {
    render({
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'done' },
      ],
      streamingText: null,
    });

    expect(element.querySelector('.gptDiv.streaming')).toBeNull();
    expect(element.querySelectorAll('.gptDiv')).toHaveLength(1);
  });
});
