import { redirect } from 'next/navigation';
import { HOME_PATH } from '@/lib/nav';

// "/" is just a doorway: signed-out visitors never get here (the proxy sends
// them to /login first), everyone else lands on the POS.
export default function Home() {
  redirect(HOME_PATH);
}
