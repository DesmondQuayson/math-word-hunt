import { notFound } from "next/navigation";

import { inspectAdminAccess } from "@/lib/admin/session";
import { loadGamePackageDelivery } from "@/lib/games/delivery";
import { createGameAssetTicket } from "@/lib/games/ticket";

export const metadata={title:"Game package preview",robots:{index:false,follow:false,noarchive:true}};
export const dynamic="force-dynamic";
export default async function AdminGamePreview({params}:{params:Promise<{packageId:string}>}){
  const access=await inspectAdminAccess();if(access.state!=="authorized")notFound();
  const game=await loadGamePackageDelivery((await params).packageId);if(!game||game.publicationState==="archived")notFound();const ticket=createGameAssetTicket({audience:"admin-preview",packageId:game.id,principalId:access.admin.id});if(!ticket)notFound();
  return <main className="admin-game-preview"><div><p className="admin-eyebrow">Restricted preview</p><h1>Package sandbox</h1><p>Scripts can run only inside this isolated frame. Network, forms, popups, top navigation, same-origin authority, device access, and clipboard access are disabled.</p></div><iframe title="Restricted game package preview" src={`/admin/games/${game.id}/preview/assets/${ticket}/${game.entryFile}`} sandbox="allow-scripts" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'; fullscreen 'none'" referrerPolicy="no-referrer" /></main>;
}
