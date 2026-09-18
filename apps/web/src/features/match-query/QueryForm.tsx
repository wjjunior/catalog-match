import type { FormEvent } from 'react';

import { Button } from '../../shared/ui/Button';

import styles from './QueryForm.module.css';

interface QueryFormProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy?: boolean;
}

export function QueryForm({ value, onChange, onSubmit, busy = false }: QueryFormProps) {
  const blank = value.trim() === '';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blank || busy) return;
    onSubmit();
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.label} htmlFor="query">
        Query
      </label>
      <div className={styles.row}>
        <input
          id="query"
          className={styles.input}
          type="text"
          autoComplete="off"
          placeholder="M8 flat washer"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        <Button type="submit" disabled={blank || busy}>
          Match
        </Button>
      </div>
    </form>
  );
}
