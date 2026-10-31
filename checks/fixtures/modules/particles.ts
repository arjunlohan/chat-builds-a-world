import type { WorldModule } from "../../../world/engine/api.js";
import { Points, PointsMaterial, BufferGeometry, BufferAttribute, Float32BufferAttribute, InstancedMesh, IcosahedronGeometry, MeshBasicMaterial, Matrix4 } from "three";
export default (): WorldModule => {
  let points: Points<BufferGeometry, PointsMaterial>, sparks: InstancedMesh, time=0;
  return {
    id:"FIXTURE_ID",
    init(s){
      const positions=new Float32Array(128*3);
      for(let i=0;i<128;i++){const angle=i*2.399963,x=i*3,y=x+1,z=x+2;positions[x]=Math.cos(angle)*(1+i%8/6);positions[y]=(i%16)/3;positions[z]=Math.sin(angle)*(1+i%8/6);}
      const geometry=new BufferGeometry();geometry.setAttribute("position",new Float32BufferAttribute(positions,3));geometry.setAttribute("color",new BufferAttribute(new Float32Array(128*3).fill(1),3));
      points=new Points(geometry,new PointsMaterial({color:"#fff2aa",size:0.36,sizeAttenuation:true}));points.position.set(-3,4,0);s.scene.add(points);
      sparks=new InstancedMesh(new IcosahedronGeometry(0.42,0),new MeshBasicMaterial({color:"#ffcc66"}),24);
      const matrix=new Matrix4();for(let i=0;i<24;i++){matrix.makeTranslation(-3+Math.cos(i*2.399963)*1.8,4+(i%8)*0.6,Math.sin(i*2.399963)*1.8);sparks.setMatrixAt(i,matrix);}sparks.instanceMatrix.needsUpdate=true;s.scene.add(sparks);
    },
    update(dt){time+=dt;points.rotation.y=time*0.15;points.position.y=4+Math.sin(time)*0.2;},
    onChat(){},onCitizenSpawn(){},onRaid(){},
    dispose(){points.geometry.dispose();points.material.dispose();points.removeFromParent();sparks.geometry.dispose();(sparks.material as MeshBasicMaterial).dispose();sparks.removeFromParent();sparks.dispose();}
  };
};
