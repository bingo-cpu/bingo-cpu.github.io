import{t as BaseGatewayAdapter}from"./port-CTHogu4t.js";
import{h as getBridgeClient}from"./lark-bridge-core.js";

const FieldType={Text:1,Number:2,DateTime:5,Checkbox:7,Url:15,Attachment:17,SingleLink:18,Lookup:19,Formula:20};
const SegmentType={Url:"url"};

function toPortFieldType(type){
  switch(type){
    case FieldType.Text:return"text";
    case FieldType.Number:return"number";
    case FieldType.Checkbox:return"checkbox";
    case FieldType.Url:return"url";
    case FieldType.Formula:return"formula";
    case FieldType.Lookup:return"lookup";
    case FieldType.DateTime:return"date";
    case FieldType.Attachment:return"attachment";
    default:return"unsupported";
  }
}
function toLarkFieldType(type){
  switch(type){
    case"number":return FieldType.Number;
    case"checkbox":return FieldType.Checkbox;
    case"url":return FieldType.Url;
    case"date":return FieldType.DateTime;
    case"attachment":return FieldType.Attachment;
    default:return FieldType.Text;
  }
}
function finiteNumber(value){
  if(typeof value==="number"&&Number.isFinite(value))return value;
  if(typeof value==="string"&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())){
    const parsed=Number(value);if(Number.isFinite(parsed))return parsed;
  }
  throw new Error("Value is not a finite decimal number");
}
function timestamp(value){
  if(typeof value==="number"&&Number.isFinite(value))return value;
  if(value instanceof Date&&Number.isFinite(value.getTime()))return value.getTime();
  if(typeof value==="string"&&value.trim()!==""){
    const numeric=Number(value);if(Number.isFinite(numeric))return numeric;
    const parsed=Date.parse(value);if(Number.isFinite(parsed))return parsed;
  }
  throw new Error("Value is not a valid timestamp");
}
function sdkValue(type,value){
  if(value==null)throw new Error("Null values are not written by the Base gateway");
  switch(type){
    case FieldType.Number:return finiteNumber(value);
    case FieldType.Text:if(typeof value==="string")return value;break;
    case FieldType.Url:{
      if(typeof value!=="string")break;
      const url=new URL(value);
      if(url.protocol!=="https:"&&url.protocol!=="http:")break;
      return[{type:SegmentType.Url,text:url.href,link:url.href}];
    }
    case FieldType.DateTime:return timestamp(value);
    case FieldType.Checkbox:if(typeof value==="boolean")return value;break;
  }
  throw new Error("Unsupported Base field value");
}
class LitePort{
  constructor(){
    this.client=getBridgeClient();
    this.eventWrappers=new Map();
  }
  async call(module,method,context=[],args=[]){
    const key=`bitable.${module}_${method}`;
    const out=await this.client.invokeApi(key,[{c:context,p:args,t:Date.now()}]);
    const value=out?.[0];
    if(value&&value.e==="bte"){
      const error=new Error(value.message||value.msg||"Feishu API error");
      Object.assign(error,value);
      throw error;
    }
    return value;
  }
  tableContext(tableId){return[tableId,null];}
  async getSelection(){
    const s=await this.call("WidgetBase","getSelection");
    if(!s?.tableId||!s?.viewId)throw new Error("Open the plugin from a Base view before collecting data");
    return{tableId:s.tableId,viewId:s.viewId,selectedRecordIds:s.recordId?[s.recordId]:[]};
  }
  async getTables(){
    const rows=await this.call("WidgetBase","getTableMetaList");
    return(rows||[]).map(({id,name})=>({id,name}));
  }
  async getViews(tableId){
    const rows=await this.call("WidgetTable","getViewMetaList",this.tableContext(tableId));
    return(rows||[]).map(({id,name})=>({id,name}));
  }
  async getFields(tableId){
    const rows=await this.call("WidgetTable","getFieldMetaList",this.tableContext(tableId));
    return(rows||[]).map(({id,name,type})=>({id,name,type:toPortFieldType(type)}));
  }
  async getRecordIds(tableId,viewId){
    const ids=[];let pageToken;
    do{
      const page=await this.call("WidgetTable","getRecordIdListByPage",this.tableContext(tableId),[{viewId,pageSize:200,pageToken}]);
      ids.push(...(page?.recordIds||[]));
      pageToken=page?.pageToken;
    }while(pageToken);
    return ids;
  }
  async selectRecordIds(tableId,viewId){
    return await this.call("UI","selectRecordIdList",[],[tableId,viewId]);
  }
  async getCellValue(tableId,recordId,fieldId){
    return await this.call("WidgetTable","getCellValue",this.tableContext(tableId),[fieldId,recordId]);
  }
  async addField(tableId,input){
    return await this.call("WidgetTable","addField",this.tableContext(tableId),[{name:input.name,type:toLarkFieldType(input.type)}]);
  }
  async setCellValue(tableId,recordId,fieldId,value){
    const meta=await this.call("WidgetTable","getFieldMetaById",this.tableContext(tableId),[fieldId]);
    const written=await this.call("WidgetTable","setCellValue",this.tableContext(tableId),[fieldId,recordId,sdkValue(meta.type,value)]);
    if(!written)throw new Error("Base rejected cell write");
  }
}
export class LarkBaseGateway extends BaseGatewayAdapter{
  constructor(){const port=new LitePort();super(port);this.port=port;}
  onContextChange(listener){
    const wrapped=()=>listener();
    this.port.client.subscribeEvent("BaseEvent_SelectionChange",wrapped);
    void this.port.call("WidgetBase","registerBaseEvent",[],["SelectionChange"]);
    return()=>{
      this.port.client.unsubscribeEvent("BaseEvent_SelectionChange",wrapped);
      void this.port.call("WidgetBase","unregisterBaseEvent",[],["SelectionChange"]);
    };
  }
}
