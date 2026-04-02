import json
import base64

path='tests/e2e/blob-all/report.jsonl'
found=0
with open(path,'rb') as f:
    for lineno,raw in enumerate(f, start=1):
        try:
            line = raw.decode('utf-8')
        except Exception:
            continue
        line=line.strip()
        if not line:
            continue
        try:
            obj=json.loads(line)
        except Exception:
            continue
        method=obj.get('method')
        if method!='onAttach':
            continue
        params=obj.get('params',{})
        attachments=params.get('attachments',[])
        for att in attachments:
            ct=att.get('contentType','')
            b64=att.get('base64')
            name=att.get('name')
            if not b64:
                continue
            # decode a small prefix of base64 to inspect magic bytes
            try:
                prefix=b64[:24]
                while len(prefix)%4!=0:
                    prefix += '='
                data=base64.b64decode(prefix)
            except Exception:
                try:
                    data=base64.b64decode(b64)
                except Exception:
                    data=b''
            if ct=='image/png':
                # JPEG magic: FF D8
                if data.startswith(b'\xff\xd8'):
                    print(f"LINE {lineno}: attachment '{name}' declared image/png but starts with JPEG magic")
                    found+=1
            if ct=='image/jpeg':
                if data.startswith(b'\x89PNG'):
                    print(f"LINE {lineno}: attachment '{name}' declared image/jpeg but starts with PNG magic")
                    found+=1

if found==0:
    print('No mismatched attachments found in',path)
else:
    print('Found',found,'mismatches')
