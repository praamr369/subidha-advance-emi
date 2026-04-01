import { redirect } from "next/navigation";

export default function CustomerEmisRedirectPage() {
  redirect("/customer/subscriptions");
}
