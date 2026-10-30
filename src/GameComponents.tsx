import { useEffect, useRef } from 'react';
import { KEY_ROWS, type Feedback, type TileState } from './game';

export type GameRow = { word: string; feedback: Feedback[] };
export type KeyAction = { type: 'letter-entered'; letter: string } | { type: 'enter-pressed' } | { type: 'backspace-pressed' };

export function actionForKey(key: string): KeyAction | null {
  const normalized = key.toUpperCase();
  if (normalized === 'ENTER') return { type: 'enter-pressed' };
  if (normalized === 'BACKSPACE') return { type: 'backspace-pressed' };
  return /^[A-Z]$/.test(normalized) ? { type: 'letter-entered', letter: normalized } : null;
}

export function actionForGameKey(key: string, { repeat = false, inControl = false }: { repeat?: boolean; inControl?: boolean } = {}): KeyAction | null {
  if (inControl || (repeat && key.toUpperCase() === 'ENTER')) return null;
  return actionForKey(key);
}

export function describeGuessFeedback(word: string, feedback: Feedback[]) {
  const descriptions = feedback.map((state, index) => `${word[index]?.toUpperCase() ?? ''} ${state === 'correct' ? 'correct position' : state === 'present' ? 'in the word, different position' : 'not in the word'}`);
  return `${word.toUpperCase()}: ${descriptions.join('; ')}.`;
}

export function buildBoardCells(length: number, attempts: number, rows: GameRow[], current: string) {
  return Array.from({ length: attempts }, (_, row) => {
    const submitted = rows[row];
    const letters = submitted?.word ?? (row === rows.length ? current : '');
    return Array.from({ length }, (_, col) => ({ letter: letters[col] ?? '', state: submitted ? submitted.feedback[col] : letters[col] ? 'filled' as const : 'empty' as const }));
  });
}

export function Tile({ letter, state, index = 0, className = '' }: { letter: string; state: TileState; index?: number; className?: string }) {
  const stateLabel = state === 'correct' ? 'correct position' : state === 'present' ? 'in word, different position' : state === 'absent' ? 'not in word' : state;
  return <div className={`tile tile-${state} ${className}`.trim()} role="cell" aria-label={`${letter ? `${letter.toUpperCase()}, ` : ''}${stateLabel}`} data-state={state} style={{ animationDelay: state === 'filled' ? `${index * 30}ms` : state === 'correct' || state === 'present' || state === 'absent' ? `${index * 75}ms` : undefined }}>{letter.toUpperCase()}</div>;
}

export function Board({ length, attempts, rows, current, status = 'active', label }: { length: number; attempts: number; rows: GameRow[]; current: string; status?: string; label?: string }) {
  const cells = buildBoardCells(length, attempts, rows, current);
  return <div className="board" role="table" aria-label={label ?? `${length} letter word board`} aria-rowcount={attempts} aria-colcount={length} data-length={length} data-status={status}>{cells.map((row, r) => <div className="board-row" role="row" aria-rowindex={r + 1} key={r} style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>{row.map((cell, c) => <Tile key={`${r}-${c}`} letter={cell.letter} state={cell.state} index={c} />)}</div>)}</div>;
}

export function Keyboard({ feedback, onAction, disabled = false }: { feedback: Record<string, Feedback>; onAction: (action: KeyAction) => void; disabled?: boolean }) {
  return <div className="keyboard" role="group" aria-label="On-screen keyboard">{KEY_ROWS.map((row) => <div className="key-row" key={row.join('')}>{row.map((key) => {
    const action = actionForKey(key);
    const state = feedback[key.toLowerCase()];
    const label = `${key === 'BACKSPACE' ? 'Backspace' : key === 'ENTER' ? 'Enter' : key}${state ? `, ${state === 'correct' ? 'correct position' : state === 'present' ? 'in word' : 'not in word'}` : ''}`;
    return <button key={key} type="button" className={`key ${key.length > 1 ? 'key-wide' : ''} ${state ? `key-${state}` : ''}`} onClick={() => action && onAction(action)} disabled={disabled} aria-label={label}>{key === 'BACKSPACE' ? '⌫' : key}</button>;
  })}</div>)}</div>;
}

export function useGameKeyboard(onAction: (action: KeyAction) => void, enabled: boolean) {
  const callback = useRef(onAction);
  callback.current = onAction;
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      const inControl = target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest('input, textarea, select, button, a[href], [role="dialog"]')));
      const action = actionForGameKey(event.key, { repeat: event.repeat, inControl });
      if (!action) return;
      event.preventDefault();
      callback.current(action);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}
export function BoardPreview() {
  const sample: GameRow[] = [{ word: 'crane', feedback: ['correct', 'present', 'absent', 'absent', 'correct'] }];
  return <section className="dev-preview"><h1>Component preview</h1><div className="dev-preview-states" role="table" aria-label="Tile states"><div role="row">{(['empty', 'filled', 'correct', 'present', 'absent'] as const).map((state, index) => <Tile key={state} letter={index ? 'A' : ''} state={state} />)}</div></div><div className="dev-preview-boards"><div><h2>Five-letter board</h2><Board length={5} attempts={6} rows={sample} current="wor" /></div><div><h2>Six-letter board</h2><Board length={6} attempts={8} rows={[{ word: 'bright', feedback: ['correct', 'present', 'absent', 'absent', 'correct', 'present'] }]} current="planet" /></div></div><Keyboard feedback={{ a: 'correct', r: 'present', n: 'absent' }} onAction={() => undefined} disabled /></section>;
}
