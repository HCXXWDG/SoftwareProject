[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/HCXXWDG/SoftwareProject/pull/10.diff' -OutFile 'pr10.diff' -UseBasicParsing
