import { makeGeneralKenobiDatagram, makeKYSDatagram, makeMessageDatagram, NetflowDatagramType, readHelloThereDatagram, readTheNegotiatorDatagram, verifySignature } from "$common/datagram/netflow.js";
import { ConnectionTarget, ConnectionTargetLike, RemoteInfo } from "$common/protocol/connection.js";
import { ChallengeControl, ECDHE } from "$common/protocol/ecdhe.js";
import { UDPConnection } from "$common/protocol/udp.js";

/**
 * This class is meant to be used as a base for UDP Server implementations.
 */
// TODO: Merge into one class. Make listen consistent with TCP.
abstract class UDPServer extends UDPConnection {
    public constructor() {
        super();
    }

    /**
     * Starts the UDP server.
     * 
     * @param port The port number for the UDP server to listen.
     */
    public listen(port: number) {
        this.socket.bind(port);
    }

    /**
     * Sends a payload
     * @param payload 
     */
    public send(payload: Buffer, target: ConnectionTargetLike) {
        this.socket.send(payload, target.port, target.address);
    }
}

/**
 * A UDP Server with integrated events and asynchronous flow control.
 * 
 * @example
 * const server = new UDPServer().listen(new ConnectionTarget(ADDRESS, PORT));
 */
class TestUDPServer extends UDPServer {
    private clients: Map<string, { ecdhe: ECDHE, challenge?: ChallengeControl }>;

    public constructor() {
        super();

        this.clients = new Map();
    }

    public onError(err: Error): void {
        this.logger.error("UDP Server got an error:", err);
    }

    public onMessage(msg: Buffer, rinfo: RemoteInfo): void {
        this.logger.log(`UDP Server got: ${msg} from ${ConnectionTarget.toQualifiedName(rinfo)}`);

        if (!verifySignature(msg)) {
            this.logger.error("Message is invalid: Invalid signature.");
            return;
        }
        
        const type = msg.readUInt32BE(4);
        switch (type) {
            case NetflowDatagramType.HELLO_THERE: { // HelloThere
                try {
                    const dg = readHelloThereDatagram(msg);

                    const ecdhe = new ECDHE("secp128r1");
                    const salt = ecdhe.link(dg.publicKey);

                    const gkdg = makeGeneralKenobiDatagram(ecdhe, rinfo.address, salt);
                    this.clients.set(ConnectionTarget.toQualifiedName(rinfo), { ecdhe, challenge: gkdg.challenge });

                    this.send(gkdg.packet, rinfo);
                } catch (e) {
                    this.logger.pError(
                        `UDP Server got an error while processing packet from ${ConnectionTarget.toQualifiedName(rinfo)}:`, 
                        e
                    );

                    const packet = makeKYSDatagram();
                    this.send(packet, rinfo);
                }
                break;
            }
            case NetflowDatagramType.GENERAL_KENOBI: { 
                // Do jack shit
                break;
            }
            case NetflowDatagramType.THE_NEGOTIATOR: {
                const dg = readTheNegotiatorDatagram(msg);
                const client = this.clients.get(ConnectionTarget.toQualifiedName(rinfo))!;

                const confirm = client.ecdhe.confirmChallenge(dg.challenge, client.challenge!);
                if (!confirm) {
                    const dg = makeKYSDatagram();
                    return this.send(dg, rinfo);
                }

                client.ecdhe.regenerateKeys(client.challenge!.control);

                const reply = makeMessageDatagram(client.ecdhe, "Authenticated!");
                this.send(reply, rinfo);
                break;
            }
            case NetflowDatagramType.MESSAGE: { // Message
                // TODO: Fuck you want?
                break;
            }
            case NetflowDatagramType.KYS: { // Commit die
                // Lmfao no
                break;
            }
        }

        // this.send(Buffer.from("Hello from UDP Server."), rinfo);
    }

    public onListen(): void {
        const address = this.socket.address();
        this.logger.log(`UDP server listening at ${address.address}:${address.port}`);
    }
}

export { 
    TestUDPServer 
};