import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { actionForGameKey, actionForKey, Board, buildBoardCells, describeGuessFeedback, Keyboard } from './GameComponents';

describe('game UI component contracts', () => {
  it('maps normal and special keys to typed actions', () => {
    expect(actionForKey('a')).toEqual({ type: 'letter-entered', letter: 'A' });
    expect(actionForKey('ENTER')).toEqual({ type: 'enter-pressed' });
    expect(actionForKey('BACKSPACE')).toEqual({ type: 'backspace-pressed' });
    expect(actionForKey('Escape')).toBeNull();
  });

  it('ignores Enter repeats and keys originating from controls without suppressing letters', () => {
    expect(actionForGameKey('Enter', { repeat: true })).toBeNull();
    expect(actionForGameKey('a', { repeat: true })).toEqual({ type: 'letter-entered', letter: 'A' });
    expect(actionForGameKey('Enter', { inControl: true })).toBeNull();
    expect(actionForGameKey('a')).toEqual({ type: 'letter-entered', letter: 'A' });
  });

  it('creates one concise textual equivalent for submitted tile feedback', () => {
    expect(describeGuessFeedback('crane', ['correct', 'present', 'absent', 'correct', 'absent'])).toBe('CRANE: C correct position; R in the word, different position; A not in the word; N correct position; E not in the word.');
  });

  it('builds responsive five- and six-column boards and fills the active row', () => {
    const five = buildBoardCells(5, 6, [], 'abc');
    expect(five).toHaveLength(6);
    expect(five[0]).toHaveLength(5);
    expect(five[0].map((cell) => cell.letter)).toEqual(['a', 'b', 'c', '', '']);
    const six = buildBoardCells(6, 8, [{ word: 'bright', feedback: ['correct', 'present', 'absent', 'absent', 'correct', 'present'] }], 'plan');
    expect(six).toHaveLength(8);
    expect(six[0]).toHaveLength(6);
    expect(six[1].slice(0, 4).map((cell) => cell.state)).toEqual(['filled', 'filled', 'filled', 'filled']);
    expect(six[0][0].state).toBe('correct');
  });

  it('renders textual feedback and semantic board and keyboard names without color-only cues', () => {
    const board = renderToStaticMarkup(createElement(Board, { length: 5, attempts: 6, rows: [{ word: 'crane', feedback: ['correct', 'present', 'absent', 'correct', 'absent'] }], current: '' }));
    expect(board).toContain('role="table"');
    expect(board).toContain('aria-rowcount="6"');
    expect(board).toContain('C, correct position');
    expect(board).toContain('R, in word, different position');
    expect(board).toContain('A, not in word');
    const keyboard = renderToStaticMarkup(createElement(Keyboard, { feedback: { c: 'correct', r: 'present', a: 'absent' }, onAction: () => undefined }));
    expect(keyboard).toContain('aria-label="C, correct position"');
    expect(keyboard).toContain('aria-label="R, in word"');
    expect(keyboard).toContain('aria-label="Backspace"');
    expect(keyboard).toContain('aria-label="Enter"');
  });
});
