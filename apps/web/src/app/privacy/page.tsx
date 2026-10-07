import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_URL, LEGAL_UPDATED, LegalPage, SimulationNotice } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={LEGAL_UPDATED}>
      <SimulationNotice />

      <p>
        This policy explains what ruggedfun.xyz (the &ldquo;Site&rdquo;) collects and why. Short version: we collect as
        little as possible. There are no real names, emails, passwords or payments, and no ads or tracking.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Username</strong>: the name you pick. It&apos;s public: it appears on trades, the live feed, holder
          lists and leaderboards.
        </li>
        <li>
          <strong>Game activity</strong>: your play-money balance, positions, trades and net-worth history, used to run
          the game and the leaderboards. Trades are shown publicly with your username.
        </li>
        <li>
          <strong>A login cookie</strong> (<code>rf_session</code>): a random token that keeps you signed in. We store
          only a one-way hash of it. It&apos;s strictly necessary for the Site to work, so there&apos;s no cookie
          banner.
        </li>
        <li>
          <strong>Browser-only settings</strong>: your sound and alert preferences are saved in your browser&apos;s
          local storage and never sent to us.
        </li>
        <li>
          <strong>IP address</strong>: used briefly, in memory, to limit how many accounts can be created from one
          place. We don&apos;t store it with your account. Our hosting provider may keep it in standard server logs.
        </li>
        <li>
          <strong>Chat messages</strong>: the live chat is simulated. Messages you type are shown only in your own
          browser and are not sent to us or to anyone else.
        </li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We don&apos;t ask for your email, real name, phone number, wallet or payment details.</li>
        <li>We don&apos;t use advertising, analytics trackers or third-party cookies.</li>
        <li>We don&apos;t sell or share your data for marketing.</li>
      </ul>

      <h2>Third parties</h2>
      <ul>
        <li>
          <strong>Railway</strong> hosts the Site and its database, and processes requests (including your IP address)
          to serve it.
        </li>
        <li>
          <strong>DiceBear</strong> (api.dicebear.com) generates the token avatar images. Your browser loads them
          directly, so DiceBear receives your IP address and browser details, like any website you load an image from.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Account and game data is kept until you delete your account or we reset the game. Net-worth snapshots are kept
        for 48 hours. Bot activity is pruned about a day after a token stops trading.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          <strong>Delete your account</strong> from the wallet menu at any time. That removes your username, balance,
          positions and history. Past trades stay in the market history without your name attached.
        </li>
        <li>Clearing your cookies signs you out permanently (accounts can&apos;t be recovered).</li>
        <li>For any other request, contact us below.</li>
      </ul>

      <h2>Children</h2>
      <p>
        The Site is for people 18 and older. We don&apos;t knowingly collect data from anyone younger. See the{" "}
        <Link href="/terms">Terms of Use</Link>.
      </p>

      <h2>Changes</h2>
      <p>We may update this policy. The date above shows the latest version.</p>

      <h2>Contact</h2>
      <p>
        Privacy questions or requests: open an issue at <a href={CONTACT_URL}>{CONTACT_URL.replace("https://", "")}</a>.
      </p>
    </LegalPage>
  );
}
