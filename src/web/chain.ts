// Browser-side Arkiv clients. No backend: the page talks to the Tiramisu node directly.

import {
  createPublicClient,
  createWalletClient,
  type PublicArkivClient,
  type WalletArkivClient,
} from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { custom, http, webSocket, type Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const HTTP_URL = (import.meta.env.VITE_ARKIV_RPC_URL as string | undefined) || undefined
const WS_URL = (import.meta.env.VITE_ARKIV_WS_URL as string | undefined) || undefined

export const EXPLORER = "https://tiramisu.explorer.arkiv.network"
export const FAUCET = "https://hub.arkiv.network/faucet"

export const pub: PublicArkivClient = createPublicClient({ chain: tiramisu, transport: http(HTTP_URL) })

/** Separate client over WebSocket, used only for live entity events (a real socket, not polling). */
export function wsClient(): PublicArkivClient {
  return createPublicClient({ chain: tiramisu, transport: webSocket(WS_URL) })
}

export type Session = { address: Hex; wallet: WalletArkivClient; kind: "injected" | "test-key" }
let session: Session | undefined
export const getSession = () => session

declare global {
  interface Window {
    ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<unknown> }
  }
}

const CHAIN_HEX = "0x" + tiramisu.id.toString(16)

export async function connectInjected(): Promise<Session> {
  const eth = window.ethereum
  if (!eth) throw new Error("No browser wallet found. Use a test key instead (testnet only).")
  const [address] = (await eth.request({ method: "eth_requestAccounts" })) as Hex[]
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] })
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: CHAIN_HEX,
        chainName: "Arkiv Tiramisu testnet",
        nativeCurrency: { name: "Golem", symbol: "GLM", decimals: 18 },
        rpcUrls: [tiramisu.rpcUrls.default.http[0]],
        blockExplorerUrls: [EXPLORER],
      }],
    })
  }
  const wallet = createWalletClient({ chain: tiramisu, transport: custom(eth), account: address })
  session = { address, wallet, kind: "injected" }
  return session
}

/** A testnet-only key kept in this browser's localStorage, so judges without MetaMask can try
 *  writes after funding it from the faucet. Never use a key that holds real funds. */
export function connectTestKey(pk?: string): Session {
  let key = (pk?.trim() || localStorage.getItem("rr_test_pk") || "") as Hex
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) key = generatePrivateKey()
  localStorage.setItem("rr_test_pk", key)
  const account = privateKeyToAccount(key)
  const wallet = createWalletClient({ chain: tiramisu, transport: http(HTTP_URL), account })
  session = { address: account.address, wallet, kind: "test-key" }
  return session
}

export function disconnect() {
  session = undefined
}

export async function balanceGLM(address: Hex): Promise<string> {
  const wei = await pub.getBalance({ address })
  return (Number(wei) / 1e18).toFixed(4)
}
