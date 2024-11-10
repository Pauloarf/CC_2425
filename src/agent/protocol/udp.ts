/**
 * @module UDP
 * UDP Client implementation.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { makeHelloThereDatagram, makeTheNegotiatorDatagram, NetflowDatagramType, readGeneralKenobiDatagram, readMessageDatagram, verifySignature } from "$common/datagram/netflow.js";
import { NetTask, NetTaskDatagramType } from "$common/datagrams/NetTask.js";
import { ConnectionTarget } from "$common/protocol/connection.js";
import { ECDHE } from "$common/protocol/ecdhe.js";
import { UDPConnection } from "$common/protocol/udp.js";
import { BufferReader } from "$common/util/buffer.js";
import { RemoteInfo } from "dgram";

/**
 * A UDP Client with integrated events and asynchronous flow control.
 * 
 * @example
 * const client = new UDPClient().connect(new ConnectionTarget(ADDRESS, PORT));
 * client.send(Buffer.from("Hello world!"))
 */
class UDPClient extends UDPConnection {
    private target!: ConnectionTarget;
    private ecdhe: ECDHE;
    // private challengeSalt!: Buffer;

    public constructor() {
        super();

        this.ecdhe = new ECDHE("secp128r1");
    }
    
    public onError(err: Error): void {
        this.logger.error("UDP Client got an error:", err);
    }

    public onMessage(msg: Buffer, rinfo: RemoteInfo): void {
        if (!this.target.match(rinfo)) {
            this.logger.info(`Ignored message from ${ConnectionTarget.toQualifiedName(rinfo)}: Not from target.`);
        }

        // this.logger.info(`UDP Client got message from target:`, msg.toString("utf8"));
        const reader = new BufferReader(msg);
        while (!reader.eof()) {
            while (!reader.eof() && reader.peek() !== 67 && reader.peek() !== 78)
                reader.readUInt8();

            //#region ============== NETFLOW ==============
            if (reader.peek() === 67 && verifySignature(reader)) {
                const type = reader.readUInt32();// readUint32BE(4);
                switch (type) {
                    case NetflowDatagramType.HELLO_THERE: { 
                        // Do fuck all
                        break;
                    }
                    case NetflowDatagramType.GENERAL_KENOBI: { 
                        this.logger.log("Got GENERAL_KENOBY frame.");
                        const dg = readGeneralKenobiDatagram(reader);
                        this.ecdhe.link(dg.publicKey, dg.salt);
    
                        const verCh = this.ecdhe.verifyChallenge(dg.challenge);
                        // this.challengeSalt = verCh.control;
    
                        // Assume authentication succeeded, compute communication salt.
                        this.ecdhe.regenerateKeys(verCh.control);
    
                        const reply = makeTheNegotiatorDatagram(verCh.challenge);
                        this.send(reply);
                        break;
                    }
                    case NetflowDatagramType.THE_NEGOTIATOR: {
                        // Who needs to negotiate when you have a fucking gun?
                        break;
                    }
                    case NetflowDatagramType.MESSAGE: { 
                        const dg = readMessageDatagram(reader);
                        const message = this.ecdhe.decrypt(dg.message);
    
                        this.logger.log(`UDP Client received message: '${message.toString("utf8")}'`);
                        break;
                    }
                    case NetflowDatagramType.KYS: { // Commit die.
                        
                        break;
                    }
                }
            }
            //#endregion  ============== NETFLOW ==============
            if (reader.peek() === 78 && NetTask.verifySignature(reader)) {
                const nt = NetTask.readNetTaskDatagram(reader);
                this.logger.info(nt);
                switch (nt.getType()) {
                    case NetTaskDatagramType.RESPONSE_METRICS: {
                        // TODO
                        break;
                    }
                    case NetTaskDatagramType.RESPONSE_REGISTER: {
                        // TODO
                        break;
                    }
                    case NetTaskDatagramType.RESPONSE_TASK: {
                        // TODO
                        break;
                    }
                    default:{
                        // TODO: Ignore?
                        break;
                    }
                }
            }
        }  
          
    }

    /**
     * Sends a payload to the target.
     * @param payload A Buffer containing the payload data.
     */
    public send(payload: Buffer): void {
        this.socket.send(payload, this.target.port, this.target.address);
    }

    /**
     * Opens a connection to a given target on a given port.
     * @param target The remote target to connect to.
     */
    public connect(target: ConnectionTarget) {
        this.target = target;
        
        const helloThere = makeHelloThereDatagram(this.ecdhe);
        this.send(helloThere);
    }

    public close() {

    }
}

export { UDPClient };