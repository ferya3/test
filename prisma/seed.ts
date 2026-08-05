/**
 * Seeds a demo dataset: an admin, a buyer, a seller, some listings and one deal
 * at each interesting point of the escrow flow.
 *
 *   npm run db:seed
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { encryptSecret, referenceCode } from "../src/lib/crypto";
import { parseUsdt } from "../src/lib/money";
import { requireWallet } from "../src/lib/wallet";
import { postEntry } from "../src/lib/ledger";
import { todayIn, weekdayIn, zonedTime } from "../src/lib/time";

const PASSWORD = "escrow-demo-1";
// Override to seed the demo thread against a different account.
const DEMO_BUYER_EMAIL = process.env.DEMO_BUYER_EMAIL ?? "saeed.raminfar@gmail.com";
// Placeholder addresses for the demo. Replace them in Admin → Settings.
const TREASURY_BSC_ADDRESS = "0x9f1a4C7b3E5d8A2f6B0c1D4e7F8a9B0c1D2e3F44";
const BUYER_BSC_ADDRESS = "0x3Ab5C7d9E1f2A4b6C8d0E2f4A6b8C0d2E4f6A8b0";

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const wallet = requireWallet();

  // "Musterstraße" is the German equivalent of "Example Street" — it reads as a
  // placeholder to anyone who speaks the language, which is the point. A real
  // street and number here would land on somebody's actual building.
  const company = {
    companyName: "EscrowBridge",
    companyStreet: "Musterstraße 1",
    companyPostalCode: "10115",
    companyCity: "Berlin",
    companyCountry: "Germany",
    companyEmail: "support@escrowbridge.site",
    companyRegistration: "",
  };

  const settings = await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", feeBasisPoints: 500, ...company },
    // The demo runs at 5%, so bring an older database along with it.
    update: { feeBasisPoints: 500, ...company },
  });

  await prisma.treasuryWallet.upsert({
    where: { network: "BSC" },
    create: {
      network: "BSC",
      address: TREASURY_BSC_ADDRESS,
      note: "Platform hot wallet — BEP-20 deposits",
    },
    update: { address: TREASURY_BSC_ADDRESS, note: "Platform hot wallet — BEP-20 deposits" },
  });

  const [admin, seller, buyer] = await Promise.all([
    upsertUser("admin@escrowbridge.test", "Platform Admin", passwordHash, "ADMIN", null),
    upsertUser("seller@escrowbridge.test", "Nadia Sells", passwordHash, "USER", wallet.deriveDepositAddress(9001, "TRON")),
    upsertUser("buyer@escrowbridge.test", "Omar Buys", passwordHash, "USER", wallet.deriveDepositAddress(9002, "TRON")),
  ]);

  await prisma.listing.deleteMany({ where: { sellerId: seller.id } });
  const listings = await Promise.all(
    [
      {
        title: "Established design-tool team workspace, 4 seats",
        category: "SUBSCRIPTION",
        price: "420.00",
        description:
          "Annual team plan with 4 seats, paid through to next spring. Handover includes the owner login, the billing email inbox and the recovery codes. Seats can be reassigned to your own addresses after transfer.",
      },
      {
        title: "Aged gaming account — level 240, full cosmetics library",
        category: "GAMING",
        price: "1250.00",
        description:
          "Original owner. Registered email included so you can rebind it to your own address. No bans, no restrictions, full purchase history available on request before you fund the deal.",
      },
      {
        title: "Short two-word .com domain with clean history",
        category: "DOMAIN",
        price: "3400.00",
        description:
          "Registered 2014, never parked with adult or gambling content, no trademark conflicts. Transfer runs through the registrar's auth code — I release the code through the vault once escrow is funded.",
      },
    ].map((item) =>
      prisma.listing.create({
        data: {
          sellerId: seller.id,
          title: item.title,
          category: item.category,
          description: item.description,
          priceMicro: parseUsdt(item.price),
        },
      }),
    ),
  );

  await prisma.deal.deleteMany({ where: { OR: [{ buyerId: buyer.id }, { sellerId: seller.id }] } });

  // 1. Waiting for the buyer to send USDT.
  await createDeal({
    buyerId: buyer.id,
    sellerId: seller.id,
    listingId: listings[0].id,
    title: listings[0].title,
    description: "Owner login plus billing inbox. Seats reassigned after transfer.",
    amount: "420.00",
    index: 1001,
    feeBasisPoints: settings.feeBasisPoints,
    status: "AWAITING_PAYMENT",
  });

  // 2. Funded — the seller owes the credentials.
  await createDeal({
    buyerId: buyer.id,
    sellerId: seller.id,
    listingId: listings[1].id,
    title: listings[1].title,
    description: "Account plus registered email. Buyer rebinds the email immediately after handover.",
    amount: "1250.00",
    index: 1002,
    feeBasisPoints: settings.feeBasisPoints,
    status: "FUNDED",
  });

  // 3. Delivered — the buyer is inspecting an unlocked vault.
  const delivered = await createDeal({
    buyerId: buyer.id,
    sellerId: seller.id,
    listingId: listings[2].id,
    title: listings[2].title,
    description: "Registrar auth code and account access for the transfer.",
    amount: "3400.00",
    index: 1003,
    feeBasisPoints: settings.feeBasisPoints,
    status: "DELIVERED",
  });

  await prisma.credential.createMany({
    data: [
      { label: "Registrar login", kind: "USERNAME", value: "nadia.transfers" },
      { label: "Registrar password", kind: "PASSWORD", value: "correct-horse-battery-19" },
      { label: "Domain auth code (EPP)", kind: "SECRET", value: "EPP-4H8K-QW21-77ZC" },
      { label: "Handover notes", kind: "NOTE", value: "Unlock the domain in the registrar panel before you start the transfer." },
    ].map((item) => ({
      dealId: delivered.id,
      label: item.label,
      kind: item.kind,
      ciphertext: encryptSecret(delivered.id, item.value),
    })),
  });

  // Give the buyer some credit so the "pay from balance" path is easy to try,
  // and the seller an earlier payout so the wallet page has history.
  await prisma.ledgerEntry.deleteMany({ where: { userId: { in: [buyer.id, seller.id] } } });
  await prisma.user.updateMany({ where: { id: { in: [buyer.id, seller.id] } }, data: { balanceMicro: 0n } });
  await postEntry({
    userId: buyer.id,
    amountMicro: parseUsdt("500"),
    kind: "MANUAL_CREDIT",
    note: "Sent USDT straight to the treasury wallet — credited by an operator",
    reference: "seed-demo",
    actorId: admin.id,
  });
  await postEntry({
    userId: seller.id,
    amountMicro: parseUsdt("180.25"),
    kind: "DEAL_PAYOUT",
    note: "Payout from an earlier completed sale",
    reference: "seed-demo",
  });

  await prisma.message.createMany({
    data: [
      { dealId: delivered.id, senderId: buyer.id, body: "Funds are in — ready when you are." },
      { dealId: delivered.id, senderId: seller.id, body: "Auth code is in the vault. Ping me if the registrar stalls." },
    ],
  });

  const namedBuyer = await seedNamedBuyerThread({ admin, seller, feeBasisPoints: settings.feeBasisPoints });

  console.log(`Seeded. Sign in with any of these (password: ${PASSWORD}):`);
  console.log(`  admin  ${admin.email}`);
  console.log(`  seller ${seller.email}`);
  console.log(`  buyer  ${buyer.email}`);
  console.log(`  buyer  ${namedBuyer.email}  (has the relayed chat history)`);
}

// These are wall-clock times as the operator experienced them, so they are
// anchored to the display zone rather than to the server's. A VPS runs in UTC,
// where "Monday 23:00" is 02:30 on Tuesday in Tehran — which moved the whole
// evening of this thread onto the wrong day.
//
// The story runs Monday night into Tuesday afternoon, so it is anchored to a
// Monday rather than to "yesterday": the buyer describes it by weekday, and a
// thread that says Monday should not read as Thursday depending on when the
// database happened to be seeded.
function storyMonday(): { year: number; month: number; day: number } {
  const today = todayIn();
  let back = (weekdayIn() + 6) % 7; // days since the most recent Monday
  // Seeded on a Monday or Tuesday, the most recent Monday would put the second
  // day of the story in the future. Step back a week so both days are past.
  if (back < 2) back += 7;
  return { ...today, day: today.day - back };
}

/** Monday evening, when the Instagram handles changed hands. */
function mondayAt(hours: number, minutes: number): Date {
  return zonedTime({ ...storyMonday(), hours, minutes });
}

/** Tuesday, when the domains followed and one of them failed. */
function tuesdayAt(hours: number, minutes: number): Date {
  const monday = storyMonday();
  return zonedTime({ ...monday, day: monday.day + 1, hours, minutes });
}

/**
 * A part-delivered deal belonging to the named buyer: five assets bought as one
 * lot, three handed over last night and two this morning, with the last one
 * failing to transfer. It exercises the case escrow exists for — most of the
 * goods arrived, one did not, and the money is still sitting with the platform.
 *
 * The thread also shows the operator acting as the go-between: the buyer only
 * ever addresses the platform, and the platform relays what the seller says.
 */
async function seedNamedBuyerThread(context: {
  admin: { id: string; email: string };
  seller: { id: string };
  feeBasisPoints: number;
}) {
  const buyer = await upsertUser(
    DEMO_BUYER_EMAIL,
    "Saeed Raminfar",
    await bcrypt.hash(PASSWORD, 10),
    "USER",
    BUYER_BSC_ADDRESS,
    "BSC",
  );

  await prisma.deal.deleteMany({ where: { buyerId: buyer.id } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: buyer.id } });
  await prisma.user.update({ where: { id: buyer.id }, data: { balanceMicro: 0n } });

  const price = "9000.00";
  const deal = await createDeal({
    buyerId: buyer.id,
    sellerId: context.seller.id,
    listingId: null,
    title: "Three Instagram handles and two matching .com domains",
    description:
      "One lot of five assets:\n" +
      "  • Instagram @artavilhayat\n" +
      "  • Instagram @artavil.hayat\n" +
      "  • Instagram @artavil_hayat\n" +
      "  • Domain artavilhayat.com\n" +
      "  • Domain artavil-hayat.com\n\n" +
      "The seller hands over the login and password for each handle plus the recovery email they are " +
      "bound to, and the registrar transfer (EPP) code for each domain with both domains unlocked. " +
      "Funds are released only once all five are in the buyer's control.",
    amount: price,
    index: 1004,
    feeBasisPoints: context.feeBasisPoints,
    status: "DELIVERED",
    network: "BSC",
    refundAddress: BUYER_BSC_ADDRESS,
    createdAt: mondayAt(20, 40),
    fundedAt: mondayAt(20, 55),
    deliveredAt: mondayAt(23, 0),
    // 48 hours from delivery, the platform default. It has lapsed by now, which
    // is the point: the buyer rejected an item, so the deal must stay put
    // rather than auto-releasing to the seller.
    inspectionEndsAt: new Date(mondayAt(23, 0).getTime() + 48 * 60 * 60 * 1000),
  });

  // The buyer topped their wallet up with price + fee, then funded the deal
  // from that balance — which is exactly how they described doing it.
  const credit = await postEntry({
    userId: buyer.id,
    amountMicro: deal.amountMicro,
    kind: "MANUAL_CREDIT",
    note: `USDT received at the treasury wallet, credited to the buyer — via BEP-20 from ${BUYER_BSC_ADDRESS}`,
    reference: "0x7c4d1f9a2b8e0c3d5f7a9b1c3d5e7f9a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e",
    actorId: context.admin.id,
  });
  const funding = await postEntry({
    userId: buyer.id,
    amountMicro: -deal.amountMicro,
    kind: "DEAL_FUNDING",
    dealId: deal.id,
    reference: deal.reference,
    note: `Funded deal ${deal.reference} from balance`,
  });
  // postEntry stamps entries as they are written; move them back onto the
  // evening the money actually changed hands so the story reads straight.
  await prisma.ledgerEntry.update({
    where: { id: credit.id },
    data: { createdAt: mondayAt(20, 42) },
  });
  await prisma.ledgerEntry.update({
    where: { id: funding.id },
    data: { createdAt: mondayAt(20, 55) },
  });

  // The vault: three handles delivered at 22:40, both domains at 04:30.
  const vault: { label: string; kind: string; value: string; at: Date }[] = [
    {
      label: "Instagram @artavilhayat — password",
      kind: "PASSWORD",
      value: "Ar7v!l-Hayat-2019#one",
      at: mondayAt(23, 0),
    },
    {
      label: "Instagram @artavil.hayat — password",
      kind: "PASSWORD",
      value: "Ar7v!l-Hayat-2019#two",
      at: mondayAt(23, 0),
    },
    {
      label: "Instagram @artavil_hayat — password",
      kind: "PASSWORD",
      value: "Ar7v!l-Hayat-2019#three",
      at: mondayAt(23, 0),
    },
    {
      label: "Recovery email bound to all three handles",
      kind: "EMAIL",
      value: "artavil.assets@mailbox.example",
      at: mondayAt(23, 0),
    },
    {
      label: "Recovery email password",
      kind: "PASSWORD",
      value: "mailbox-9f21-recovery",
      at: mondayAt(23, 0),
    },
    {
      label: "artavilhayat.com — transfer (EPP) code",
      kind: "SECRET",
      value: "EPP-8H2K-QW71-ZC44",
      at: tuesdayAt(4, 30),
    },
    {
      label: "artavil-hayat.com — transfer (EPP) code",
      kind: "SECRET",
      value: "EPP-3M9P-RT06-LD18",
      at: tuesdayAt(4, 30),
    },
    {
      label: "Registrar and handover notes",
      kind: "NOTE",
      value:
        "Both domains sit at the same registrar. Unlock is already done on artavilhayat.com. " +
        "Change the Instagram passwords and rebind the recovery email as soon as you are in.",
      at: tuesdayAt(4, 30),
    },
  ];

  await prisma.credential.deleteMany({ where: { dealId: deal.id } });
  for (const item of vault) {
    const failing = item.label.startsWith("artavil-hayat.com");
    await prisma.credential.create({
      data: {
        dealId: deal.id,
        label: item.label,
        kind: item.kind,
        ciphertext: encryptSecret(deal.id, item.value),
        createdAt: item.at,
        confirmedAt: failing ? null : item.at,
        rejectedAt: failing ? tuesdayAt(12, 46) : null,
        rejectedNote: failing
          ? "The registrar rejects this EPP code and WHOIS still shows the domain as locked."
          : null,
      },
    });
  }

  const thread: { at: Date; from: "BUYER" | "STAFF"; body: string }[] = [
    {
      at: mondayAt(21, 0),
      from: "BUYER",
      body:
        "I have topped my wallet up with 9,450 USDT over BEP-20 and funded this deal — 9,000 for the five assets " +
        "plus the 5% platform fee. To be clear about what that means: the money is held by you, not by the seller. " +
        "I will confirm the release only once I have every username and password and I have checked all five myself.",
    },
    {
      at: mondayAt(21, 8),
      from: "STAFF",
      body:
        "That is exactly right, Saeed. Your BEP-20 transfer landed and the 9,450 USDT is in escrow with us. The " +
        "seller can see the deal is funded but cannot touch a single dollar of it until you release. I have asked " +
        "them to start with the three Instagram handles.",
    },
    {
      at: mondayAt(23, 0),
      from: "STAFF",
      body:
        "The seller has handed over the three Instagram accounts. Passwords for @artavilhayat, @artavil.hayat and " +
        "@artavil_hayat are in the vault on this deal, along with the recovery email all three are bound to and " +
        "its password. Sign in to each one and change the password straight away.",
    },
    {
      at: mondayAt(23, 32),
      from: "BUYER",
      body:
        "All three handles are in. I have changed every password and moved the recovery email over to my own " +
        "address. Instagram side confirmed — three of five done. Waiting on the two domains.",
    },
    {
      at: mondayAt(23, 40),
      from: "STAFF",
      body: "Noted and logged. Passing it to the seller now to get the domain transfer codes moving.",
    },
    {
      at: tuesdayAt(4, 30),
      from: "STAFF",
      body:
        "The seller has provided the transfer codes for both domains — they are in the vault. They say both " +
        "domains are unlocked at the registrar and neither is inside a 60-day transfer lock.",
    },
    {
      at: tuesdayAt(12, 40),
      from: "BUYER",
      body:
        "artavilhayat.com has transferred. It is in my registrar account now, so that is four of the five " +
        "confirmed.",
    },
    {
      at: tuesdayAt(12, 46),
      from: "BUYER",
      body:
        "artavil-hayat.com will not transfer though. The registrar rejects the EPP code and the domain still " +
        "shows as locked on the WHOIS. I have marked that item as not working in the vault. Please ask the seller " +
        "to unlock it and issue a fresh code — I am not releasing while one of the five is outstanding.",
    },
    {
      at: tuesdayAt(12, 58),
      from: "STAFF",
      body:
        "Understood, and nothing is released. The full 9,450 USDT stays with us. I have passed it to the seller " +
        "and asked them to unlock artavil-hayat.com and reissue the code. If they cannot deliver it, open a " +
        "dispute from this page and a moderator will decide the outcome — do not release in the meantime.",
    },
  ];

  await prisma.message.deleteMany({ where: { dealId: deal.id } });
  for (const message of thread) {
    await prisma.message.create({
      data: {
        dealId: deal.id,
        senderId: message.from === "BUYER" ? buyer.id : context.admin.id,
        body: message.body,
        isStaff: message.from === "STAFF",
        createdAt: message.at,
      },
    });
  }

  return buyer;
}

function upsertUser(
  email: string,
  displayName: string,
  passwordHash: string,
  role: string,
  payoutAddress: string | null,
  payoutNetwork = "TRON",
) {
  return prisma.user.upsert({
    where: { email },
    create: { email, displayName, passwordHash, role, payoutAddress, payoutNetwork },
    update: { displayName, passwordHash, role, payoutAddress, payoutNetwork },
  });
}

async function createDeal(input: {
  buyerId: string;
  sellerId: string;
  listingId: string | null;
  title: string;
  description: string;
  amount: string;
  index: number;
  feeBasisPoints: number;
  status: string;
  network?: string;
  refundAddress?: string;
  createdAt?: Date;
  fundedAt?: Date;
  deliveredAt?: Date;
  inspectionEndsAt?: Date;
}) {
  // The fee is charged on top of the sale price, matching src/lib/deals.ts.
  const priceMicro = parseUsdt(input.amount);
  const feeMicro = (priceMicro * BigInt(input.feeBasisPoints)) / 10_000n;
  const amountMicro = priceMicro + feeMicro;
  const network = (input.network ?? "TRON") as "TRON" | "BSC" | "ETHEREUM";
  const now = new Date();
  const funded = input.status !== "AWAITING_PAYMENT";
  const delivered = input.status === "DELIVERED";
  // A deal must always read as opened before it was funded.
  const createdAt = input.createdAt ?? new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const fundedAt = input.fundedAt ?? new Date(now.getTime() - 60 * 60 * 1000);

  return prisma.deal.create({
    data: {
      reference: referenceCode(),
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      listingId: input.listingId ?? null,
      title: input.title,
      description: input.description,
      status: input.status,
      amountMicro,
      feeMicro,
      payoutMicro: priceMicro,
      network,
      depositAddress: requireWallet().deriveDepositAddress(input.index, network),
      depositDerivation: input.index,
      inspectionHours: 48,
      buyerRefundAddress: input.refundAddress ?? requireWallet().deriveDepositAddress(9002, "TRON"),
      createdAt,
      expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      fundedAt: funded ? fundedAt : null,
      deliveredAt: delivered ? (input.deliveredAt ?? new Date(now.getTime() - 30 * 60 * 1000)) : null,
      inspectionEndsAt: delivered
        ? (input.inspectionEndsAt ?? new Date(now.getTime() + 47 * 60 * 60 * 1000))
        : null,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
