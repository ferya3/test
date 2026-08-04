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
import { getWallet } from "../src/lib/wallet";
import { postEntry } from "../src/lib/ledger";

const PASSWORD = "escrow-demo-1";
// Override to seed the demo thread against a different account.
const DEMO_BUYER_EMAIL = process.env.DEMO_BUYER_EMAIL ?? "saeed.raminfar@gmail.com";

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const wallet = getWallet();

  const settings = await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });

  const [admin, seller, buyer] = await Promise.all([
    upsertUser("admin@escrowbridge.test", "Platform Admin", passwordHash, "ADMIN", null),
    upsertUser("seller@escrowbridge.test", "Nadia Sells", passwordHash, "USER", wallet.deriveDepositAddress(9001)),
    upsertUser("buyer@escrowbridge.test", "Omar Buys", passwordHash, "USER", wallet.deriveDepositAddress(9002)),
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

/** Yesterday at the given wall-clock time, in the machine's own timezone. */
function yesterdayAt(hours: number, minutes: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function todayAt(hours: number, minutes: number): Date {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * A funded deal belonging to the named buyer, with a message thread that runs
 * from 9pm last night. It demonstrates the platform acting as the go-between:
 * the buyer only ever addresses the operator, and the operator comes back with
 * the seller's answers.
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
    getWallet().deriveDepositAddress(9003),
  );

  await prisma.deal.deleteMany({ where: { buyerId: buyer.id } });

  const deal = await createDeal({
    buyerId: buyer.id,
    sellerId: context.seller.id,
    listingId: null,
    title: "Aged gaming account — level 240, full cosmetics library",
    description:
      "Full account handover: login, current password, the original registered email and its recovery codes. " +
      "Buyer rebinds the email to their own address within 24 hours of delivery.",
    amount: "1250.00",
    index: 1004,
    feeBasisPoints: context.feeBasisPoints,
    status: "FUNDED",
    createdAt: yesterdayAt(20, 55),
    fundedAt: yesterdayAt(21, 52),
  });

  // Alternating buyer → operator → buyer, with the operator relaying whatever
  // the seller said. Timestamps are set explicitly so the thread reads as a
  // conversation that started last night.
  const thread: { at: Date; from: "BUYER" | "STAFF"; body: string }[] = [
    {
      at: yesterdayAt(21, 0),
      from: "BUYER",
      body: "Hi — I've just opened the deal for the level 240 account. Before I send the USDT, can you check with the seller that the original registered email is included?",
    },
    {
      at: yesterdayAt(21, 6),
      from: "STAFF",
      body: "Evening Saeed. Asking the seller now — give me a few minutes.",
    },
    {
      at: yesterdayAt(21, 14),
      from: "STAFF",
      body: "Seller confirms the original registered email is included, together with its recovery codes. They ask that you rebind it to an address of your own within 24 hours of handover.",
    },
    {
      at: yesterdayAt(21, 18),
      from: "BUYER",
      body: "Good. Has the account ever been suspended or limited? I don't want to pay and then find out it is restricted.",
    },
    {
      at: yesterdayAt(21, 31),
      from: "STAFF",
      body: "Seller says there have been no suspensions and there are no active restrictions. They have offered to walk you through the account's security page on a screen share before you fund, if you want that.",
    },
    {
      at: yesterdayAt(21, 35),
      from: "BUYER",
      body: "Not necessary. I'll fund the escrow now.",
    },
    {
      at: yesterdayAt(21, 52),
      from: "BUYER",
      body: "Sent — 1,250 USDT to the deposit address on this deal.",
    },
    {
      at: yesterdayAt(22, 4),
      from: "STAFF",
      body: "Confirmed on-chain. The escrow is funded and the seller has been asked to deliver. Nothing reaches them until you have checked the account and released it.",
    },
    {
      at: todayAt(9, 12),
      from: "STAFF",
      body: "Morning. The seller says the handover pack will be in the vault before noon. I'll chase them if it slips.",
    },
    {
      at: todayAt(9, 20),
      from: "BUYER",
      body: "Thanks. Please make sure the password they put in is the one currently active, not an old one.",
    },
    {
      at: todayAt(9, 24),
      from: "STAFF",
      body: "Passed that on. They will reset the password immediately before delivering and put the fresh one in the vault.",
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
) {
  return prisma.user.upsert({
    where: { email },
    create: { email, displayName, passwordHash, role, payoutAddress },
    update: { displayName, passwordHash, role, payoutAddress },
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
  createdAt?: Date;
  fundedAt?: Date;
}) {
  const amountMicro = parseUsdt(input.amount);
  const feeMicro = (amountMicro * BigInt(input.feeBasisPoints)) / 10_000n;
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
      payoutMicro: amountMicro - feeMicro,
      depositAddress: getWallet().deriveDepositAddress(input.index),
      depositDerivation: input.index,
      inspectionHours: 48,
      buyerRefundAddress: getWallet().deriveDepositAddress(9002),
      createdAt,
      expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      fundedAt: funded ? fundedAt : null,
      deliveredAt: delivered ? new Date(now.getTime() - 30 * 60 * 1000) : null,
      inspectionEndsAt: delivered ? new Date(now.getTime() + 47 * 60 * 60 * 1000) : null,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
