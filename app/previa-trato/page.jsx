import { notFound } from "next/navigation";
import PreviaTrato from "./PreviaTrato";

export default function PaginaPreviaTrato() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PreviaTrato />;
}
