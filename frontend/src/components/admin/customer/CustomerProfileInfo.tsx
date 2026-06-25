type CustomerProfileInfoProps = {
  name: string;
  customerCode: string;
  phone: string;
  kycStatus: "PENDING" | "VERIFIED" | "REJECTED";
};

export default function CustomerProfileInfo({ name, customerCode, phone, kycStatus }: CustomerProfileInfoProps) {
  return (
    <section className="rounded border bg-card p-4">
      <h3 className="text-lg font-semibold">{name}</h3>
      <p>Customer Code: {customerCode}</p>
      <p>Phone: {phone}</p>
      <p>KYC Status: {kycStatus}</p>
    </section>
  );
}
