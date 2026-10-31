#include <stdio.h>
#include <stdlib.h>
#include "quickjs.h"
int main(int argc,char**argv){
  FILE*f=fopen(argv[1],"rb"); if(!f){printf("no file\n");return 2;}
  fseek(f,0,SEEK_END); long n=ftell(f); fseek(f,0,SEEK_SET);
  char*b=malloc(n+1); fread(b,1,n,f); b[n]=0; fclose(f);
  JSRuntime*rt=JS_NewRuntime(); JSContext*ctx=JS_NewContext(rt);
  JS_SetMaxStackSize(rt, 4u<<20);
  JSValue v=JS_Eval(ctx,b,(size_t)n,argv[1],JS_EVAL_TYPE_GLOBAL);
  if(JS_IsException(v)){
    JSValue e=JS_GetException(ctx); const char*m=JS_ToCString(ctx,e);
    printf("EXC: %s\n", m?m:"?");
    JSValue st=JS_GetPropertyStr(ctx,e,"stack"); const char*s=JS_ToCString(ctx,st);
    if(s) printf("STACK: %s\n", s);
  } else printf("OK parsed+ran\n");
  return 0;
}
