/** Low LODs retain surface names and UVs; the bank borrows the high LOD's immutable materials. */
export function stripLodImages(document){for(const texture of document.getRoot().listTextures())texture.dispose();}
