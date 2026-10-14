import { startTransition, type FormEvent } from 'react';

/**
 * An onSubmit handler that runs a form action without React 19's automatic
 * form reset. The reset is right after a success, but after a validation
 * error it throws away what the visitor typed — a wrong password would also
 * clear the email. The form's `action` prop stays set, so it still submits
 * before JavaScript has loaded.
 */
export function submitWithoutReset(action: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };
}
