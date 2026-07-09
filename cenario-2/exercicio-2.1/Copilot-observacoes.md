Arquivo [copilot-chat-agentsv1](./copilot-chat-agentsv1) contém a transcrição da sessão para criar um endpoint com [AGENTS.md v1](./AGENTS-v1.md) usando github copilot.

Coisas a notar

1. por algum motivo, o copilot fez questão de forçar caracteres ASCII, mas deveríamos usar UTF-8 para acentos do português. Nada no AGENTS.md menciona encoding.
2. apesar da definição da estrutura de arquivos do AGENTS.md, o copilot não fez nenhum esforço de segui-los ou expandí-los mesmo sendo relevante para a construção do endpoint.
    - Talvez a estrutura da pasta `shared` não foi usada pois nada foi "compartilhado" para este endpoint, que é o primeiro do projeto.
3. Zod usado para validar tipagem, como esperado
4. Validação da ADR-0002 ficou como parte do arquivo handler.ts, mas é claramente algo a ser compartilhado em endpoints futuros.
5. Não houve adição de console.log, mas também não houve adição de nada de logging. Como o prompt inicial foi super simples, isso é até esperado, mas poderíamos ter no AGENTS que queremos logging para nossas requests.
6. **A criação do endpoint não instalou @azure/functions**. Em testes preliminares ela havia sido instalada normalmente, mas pode ser só uma variação da IA / não-determinismo. De toda forma, vale a pena adicionar uma ênfase disso no AGENTS.md.


O AGENTS.md atualizado está em [AGENTS-v2.md](./AGENTS-v2.md).