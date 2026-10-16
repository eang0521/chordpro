const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** When something was last edited, briefly: "Today, 3:15 PM", "Oct 2", or "Oct 2, 2024". */
export function formatEdited(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (sameDay(date, now)) return `Today, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}
