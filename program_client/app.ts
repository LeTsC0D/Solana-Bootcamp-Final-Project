import {Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction,} from "@solana/web3.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
    burnSendAndConfirm,
    CslSplTokenPDAs,
    deriveTicketMetadataPDA,
    getTicketMetadata,
    initializeClient,
    mintSendAndConfirm,
    transferSendAndConfirm,
} from "./index";
import {getMinimumBalanceForRentExemptAccount, getMint, TOKEN_PROGRAM_ID,} from "@solana/spl-token";

async function main(feePayer: Keypair) {
    const args = process.argv.slice(2);
    const connection = new Connection("https://api.devnet.solana.com", {
        commitment: "confirmed",
    });

    const progId = new PublicKey(args[0]!);

    initializeClient(progId, connection);


    /**
     * Create a keypair for the mint
     */
    const mint = Keypair.generate();
    console.info("+==== Mint Address  ====+");
    console.info(mint.publicKey.toBase58());

    /**
     * Create two wallets
     */
    const shashankWallet = Keypair.generate();
    console.info("+==== Shashank Wallet ====+");
    console.info(shashankWallet.publicKey.toBase58());

    const patikaWallet = Keypair.generate();
    console.info("+==== PatikaWallet Wallet ====+");
    console.info(patikaWallet.publicKey.toBase58());

    const rent = await getMinimumBalanceForRentExemptAccount(connection);
    await sendAndConfirmTransaction(
        connection,
        new Transaction()
            .add(
                SystemProgram.createAccount({
                    fromPubkey: feePayer.publicKey,
                    newAccountPubkey: shashankWallet.publicKey,
                    space: 0,
                    lamports: rent,
                    programId: SystemProgram.programId,
                }),
            )
            .add(
                SystemProgram.createAccount({
                    fromPubkey: feePayer.publicKey,
                    newAccountPubkey: patikaWallet.publicKey,
                    space: 0,
                    lamports: rent,
                    programId: SystemProgram.programId,
                }),
            ),
        [feePayer, shashankWallet, patikaWallet],
    );

    /**
     * Derive the Ticket Metadata so we can retrieve it later
     */
    const [ticketPub] = deriveTicketMetadataPDA(
        {
            mint: mint.publicKey,
        },
        progId,
    );
    console.info("+==== Ticket Metadata Address ====+");
    console.info(ticketPub.toBase58());

    /**
     * Derive the Shashank's Associated Token Account, this account will be
     * holding the minted NFT.
     */
    const [shashankATA] = CslSplTokenPDAs.deriveAccountPDA({
        wallet: shashankWallet.publicKey,
        mint: mint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
    });
    console.info("+==== Shashank ATA ====+");
    console.info(shashankATA.toBase58());

    /**
     * Derive the Patika's Associated Token Account, this account will be
     * holding the minted NFT when John Doe transfer it
     */
    const [patikaATA] = CslSplTokenPDAs.deriveAccountPDA({
        wallet: patikaWallet.publicKey,
        mint: mint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
    });
    console.info("+==== Patika ATA ====+");
    console.info(patikaATA.toBase58());

    /**
     * Mint a new NFT into Shashank's wallet (technically, the Associated Token Account)
     */
    console.info("+==== Minting... ====+");
    await mintSendAndConfirm({
        wallet: shashankWallet.publicKey,
        assocTokenAccount: shashankATA,
        ticketType: "VIP",
        currency: "SOL",
        limitedEdition: "Yes",
        additionalBenefits: "Yes",
        rating: "5 star",
        schedule: "sunday 9 pm",
        organizer: "Concert ATA",
        description: "buy the ticket for concert",
        signers: {
            feePayer: feePayer,
            funding: feePayer,
            mint: mint,
            owner: shashankWallet,
        },
    });
    console.info("+==== Minted ====+");

    /**
     * Get the minted token
     */
    let mintAccount = await getMint(connection, mint.publicKey);
    console.info("+==== Mint ====+");
    console.info(mintAccount);

    /**
     * Get the Ticket Metadata
     */
    let ticket = await getTicketMetadata(ticketPub);
    console.info("+==== ticket Metadata ====+");
    console.info(ticket);
    console.assert(ticket!.assocAccount!.toBase58(), shashankATA.toBase58());

    /**
     * Transfer Shashank's NFT to Jane Doe Wallet (technically, the Associated Token Account)
     */
    console.info("+==== Transferring... ====+");
    await transferSendAndConfirm({
        wallet: patikaWallet.publicKey,
        assocTokenAccount: patikaATA,
        mint: mint.publicKey,
        source: shashankATA,
        destination: patikaATA,
        signers: {
            feePayer: feePayer,
            funding: feePayer,
            authority: shashankWallet,
        },
    });
    console.info("+==== Transferred ====+");

    /**
     * Get the minted token
     */
    mintAccount = await getMint(connection, mint.publicKey);
    console.info("+==== Mint ====+");
    console.info(mintAccount);

    /**
     * Get the Ticket Metadata
     */
    ticket = await getTicketMetadata(ticketPub);
    console.info("+==== ticket Metadata ====+");
    console.info(ticket);
    console.assert(ticket!.assocAccount!.toBase58(), patikaATA.toBase58());

    /**
     * Burn the NFT
     */
    console.info("+==== Burning... ====+");
    await burnSendAndConfirm({
        mint: mint.publicKey,
        wallet: patikaWallet.publicKey,
        signers: {
            feePayer: feePayer,
            owner: patikaWallet,
        },
    });
    console.info("+==== Burned ====+");

    /**
     * Get the minted token
     */
    mintAccount = await getMint(connection, mint.publicKey);
    console.info("+==== Mint ====+");
    console.info(mintAccount);

    /**
     * Get the Ticket Metadata
     */
    ticket = await getTicketMetadata(ticketPub);
    console.info("+==== Ticket Metadata ====+");
    console.info(ticket);
    console.assert(typeof ticket!.assocAccount, "undefined");
}

fs.readFile(path.join(os.homedir(), ".config/solana/id.json")).then((file) =>
    main(Keypair.fromSecretKey(new Uint8Array(JSON.parse(file.toString())))),
);
