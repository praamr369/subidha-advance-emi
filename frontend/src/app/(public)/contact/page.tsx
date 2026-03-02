import PublicNav from "@/components/ui/public-nav";
import PortalPage from "@/components/ui/portal-page";

export default function ContactPage() {
  return (
    <PortalPage title="Contact & WhatsApp" subtitle="Need assistance with enrollment, EMI status, or draw transparency?">
      <PublicNav />
      <ul>
        <li>Office: Subidha Furniture, Asansol, West Bengal</li>
        <li>WhatsApp Support: +91-XXXXXXXXXX</li>
        <li>Email: support@subidha.example</li>
      </ul>
    </PortalPage>
  );
}
