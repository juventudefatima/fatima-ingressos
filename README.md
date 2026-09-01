# SI-DATA — Sistema de Ingressos Digitais da Paróquia Nossa Senhora de Fátima

MVP completo de venda, emissão e validação de tickets digitais, pensado para
rodar **de graça**: frontend estático no GitHub Pages + backend/dados no
Supabase (Postgres + Auth). Não há nenhum servidor Node/Express para manter no ar.

## Sumário

1. [Stack e decisões técnicas](#stack-e-decisões-técnicas)
2. [Passo a passo — Supabase](#passo-a-passo--supabase)
3. [Passo a passo — rodar localmente](#passo-a-passo--rodar-localmente)
4. [Passo a passo — publicar no GitHub Pages](#passo-a-passo--publicar-no-github-pages)
5. [Como o sistema funciona](#como-o-sistema-funciona)
6. [Roteiro de teste manual](#roteiro-de-teste-manual)
7. [Limitações conhecidas do MVP](#limitações-conhecidas-do-mvp)

---

## Stack e decisões técnicas

| Camada | Tecnologia |
|---|---|
| Frontend | React + Vite + TypeScript + React Router + Tailwind CSS |
| Backend / dados | Supabase (Postgres, Auth, Edge Functions) |
| Código de barras | `jsbarcode` (Code128) + `qrcode` como alternativa na mesma tela |
| Leitura por câmera | `@zxing/browser` (lê Code128 e QR na mesma varredura) |
| Hospedagem | GitHub Pages (frontend) — Supabase free tier (dados) |

**Por que Code128 em vez de EAN-8?** EAN-8 foi feito para produtos
comerciais: tem só 8 dígitos, exige dígito verificador em formato fixo e sua
"unicidade" depende de registro em uma entidade (GS1). Isso o torna previsível
e insuficiente para um identificador de segurança — 8 dígitos numéricos podem
ser adivinhados ou colidir facilmente em um evento com milhares de tickets.
Por isso o ticket usa um código aleatório de 10 caracteres em Base32 (sem
caracteres ambíguos), gerado com uma função criptográfica seguro do Postgres
(`gen_random_bytes`), representado como **Code128** (suporta letras e números)
e, como alternativa/fallback ainda mais fácil de escanear pela câmera de um
celular, o mesmo código também é mostrado como **QR code** na mesma tela.

**Por que não usar token rotativo (item 23 do briefing)?** Um token que muda
sozinho a cada abertura de tela cria problemas reais de sincronização (ex.:
cliente abre o ticket, o token vira X; a internet do validador está um
pouco atrasada; QR mostrado já não é mais válido). O briefing já previa essa
alternativa mais simples e recomendava usá-la quando fosse mais segura: aqui
o código é **estático por ticket**, e toda a segurança contra reuso está no
**estado do servidor** (`quantity_purchased` x `quantity_redeemed`, validado
dentro de uma função transacional). Isso é mais simples, não tem problema de
sincronização, e é igualmente seguro — o código sozinho não permite reuso
indevido porque cada tentativa de entrega é revalidada no banco.

**Por que Edge Functions em vez de mexer direto em `auth.users`?** Criar um
usuário do Supabase Auth (com senha) exige a API administrativa
(`service_role`). Um "Backend/Express tradicional" foi explicitamente
descartado no briefing — por isso usamos **Edge Functions do próprio
Supabase**, que são serverless (não há servidor para manter no ar) e mantêm a
`service_role key` **só no servidor**, nunca no navegador. Só existem duas:
`create-customer` (usada pelo caixa) e `create-staff-user` (usada pelo admin).

**Por que quase nenhuma tabela sensível aceita INSERT/UPDATE direto?** Toda
escrita que envolve regra de negócio (vender, validar, cancelar, reabrir)
passa por funções `SECURITY DEFINER` no Postgres (pasta `supabase/sql`), que
reconferem o papel de quem chama e revalidam tudo no servidor — o app nunca
manda o servidor "confiar" em um total, preço ou quantidade calculado no
navegador.

**Segurança contra dupla entrega (item 11 do briefing):** a função
`redeem_ticket_items` trava a linha do ticket e, dentro da mesma transação,
trava a linha específica de cada item com `SELECT ... FOR UPDATE` antes de
checar e descontar a quantidade disponível. Se dois validadores lerem o
mesmo ticket ao mesmo tempo, o segundo `FOR UPDATE` espera o primeiro
terminar (commit) e só então enxerga o saldo já atualizado — não é possível
duas operações consumirem a mesma unidade simultaneamente.

---

## Passo a passo — Supabase

### 1. Criar o projeto

1. Crie uma conta em [supabase.com](https://supabase.com) e clique em **New project**.
2. Anote a **Project URL** e a **anon public key** (Project Settings → API). Você vai usá-las no `.env`.

### 2. Executar o SQL

No painel do Supabase, abra **SQL Editor** e execute, **nesta ordem**, o
conteúdo de cada arquivo da pasta `supabase/sql/`:

1. `01_schema.sql` — tabelas, enums, índices.
2. `02_functions.sql` — todas as funções RPC (vendas, validação, relatórios).
3. `03_policies.sql` — Row Level Security de todas as tabelas.
4. `04_seed_admin.sql` — leia os comentários do arquivo: você primeiro cria
   manualmente 1 usuário em **Authentication → Users** (e-mail
   `staff.admin@eventix.local`), copia o UUID dele, cola no script e só
   então executa. Esse é o único administrador criado "na mão" — todos os
   outros usuários (caixa, validador, cliente) são criados pelo próprio
   sistema depois disso.
5. `05_password_reset.sql`, `06_admin_improvements.sql`,
   `07_sales_limits.sql` e `08_stock_and_order_edit.sql` — melhorias
   incrementais (rate limit de login, edição de item de pedido, atribuição
   de eventos/produtos por caixa, limite de estoque, estoque em tempo real
   no caixa e des-cancelar/editar pedido completo). Execute todos, na ordem
   numérica.

### 3. Configurar o Auth

Em **Authentication → Providers → Email**:

- Desative a opção de exigir confirmação por link de e-mail
  ("Confirm email"), já que os e-mails usados aqui são sintéticos
  (`cliente.<telefone>@eventix.local`, `staff.<usuário>@eventix.local`) e
  não existem de verdade — ninguém vai clicar em um link de confirmação.
  As Edge Functions já criam os usuários com `email_confirm: true`, então
  isso é só para manter consistência caso alguém tente outro fluxo do Auth.

### 4. Publicar as Edge Functions

Instale a [Supabase CLI](https://supabase.com/docs/guides/cli) e rode, na raiz do projeto:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy create-customer
supabase functions deploy create-staff-user
```

Depois, defina o segredo com a `service_role key` (Project Settings → API →
`service_role secret`) **apenas no servidor** — ela nunca entra no `.env` do
frontend:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
supabase secrets set SUPABASE_URL=https://SEU-PROJETO.supabase.co
supabase secrets set SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
```

> As Edge Functions rodam em runtime Deno gerenciado pelo próprio Supabase —
> não é um servidor que você precisa manter, reiniciar ou pagar hospedagem à parte.

---

## Passo a passo — rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# edite .env e cole a Project URL e a anon key do seu projeto Supabase

# 3. Rodar
npm run dev
```

Acesse `http://localhost:5173`. Faça login como administrador (usuário
`admin`, com a senha que você definiu ao criar o usuário no passo do Auth).

---

## Passo a passo — publicar no GitHub Pages

1. Crie um repositório no GitHub e envie o código:
   ```bash
   git init
   git add .
   git commit -m "SI-DATA MVP"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git push -u origin main
   ```
2. No repositório, vá em **Settings → Pages** e, em "Build and deployment",
   escolha **Source: GitHub Actions**.
3. Em **Settings → Secrets and variables → Actions**, crie dois secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Dê um novo `git push` (ou rode o workflow manualmente em **Actions**). O
   workflow em `.github/workflows/deploy.yml` builda o projeto com o `base`
   path correto (`/nome-do-repositorio/`) e publica automaticamente.
5. Seu site ficará em `https://SEU_USUARIO.github.io/SEU_REPOSITORIO/`.

O workflow já resolve o problema de roteamento de SPA no GitHub Pages
copiando `index.html` para `404.html` — assim, ao acessar diretamente uma
rota como `/validador`, o GitHub Pages serve o app em vez de um erro 404, e o
React Router assume o roteamento a partir daí.

---

## Como o sistema funciona

- **Admin** entra em `/admin`: cria e publica eventos, cadastra produtos,
  cria logins de caixa/validador, acompanha pedidos e relatórios.
- **Caixa** entra em `/caixa`: escolhe o evento, monta a venda, informa
  nome/telefone do cliente (a conta é criada automaticamente — senha inicial
  = 4 primeiros dígitos do telefone sem o DDD) e finaliza. Um único ticket é
  gerado por venda, com todos os produtos comprados dentro dele.
- **Cliente** entra em `/meus-tickets` com telefone + senha: vê seus
  tickets, quantidades disponíveis por produto, e o código
  (barras/QR) só aparece no dia do evento. No primeiro acesso, o app força a
  troca da senha inicial.
- **Validador** entra em `/validador`: escolhe o evento do dia, ativa a
  câmera (ou digita o código manualmente), vê os produtos e as quantidades
  disponíveis, escolhe o que está sendo entregue agora (parcial ou tudo de
  uma vez) e confirma — a baixa é atômica e segura contra dupla entrega.

---

## Roteiro de teste manual

1. **Admin** → login → criar evento (data de hoje, para facilitar o teste)
   → publicar → criar 2–3 produtos.
2. **Admin** → Usuários → criar 1 usuário "Caixa" e 1 usuário "Validador".
3. **Caixa** → login → selecionar o evento → adicionar produtos e
   quantidades → informar nome e telefone de um cliente fictício →
   finalizar venda → anotar o código do ticket exibido no recibo.
4. **Cliente** → login com o telefone usado na venda e a senha (4 primeiros
   dígitos do telefone, sem o DDD) → app pede para trocar a senha →
   trocar → abrir "Meus tickets" → como o evento é hoje, o código de
   barras/QR já aparece.
5. **Validador** → login → selecionar o mesmo evento → ativar câmera (ou
   digitar o código manualmente) → conferir que aparecem os produtos e
   quantidades corretas → selecionar 1 unidade de um produto → "Confirmar
   entrega" → conferir que a quantidade disponível diminuiu.
6. Repetir a entrega do mesmo item até esgotar a quantidade disponível →
   tentar entregar mais uma unidade → o sistema deve bloquear com a
   mensagem "Quantidade solicitada maior que a disponível".
7. **Admin** → Relatórios → conferir que vendidos/entregues/restantes batem
   com o que foi feito nos passos acima.

---

## Limitações conhecidas do MVP

- Não há gateway de pagamento (Mercado Pago/Stripe); vendas são registradas
  como pagas/pendentes/canceladas manualmente pelo caixa, conforme pedido
  no briefing. A arquitetura (tabela `orders.payment_status`,
  `payment_method`) já está pronta para plugar um gateway depois.
- IP do usuário nos logs de auditoria não é capturado no MVP (o Postgres não
  tem acesso direto ao IP do cliente HTTP sem uma camada intermediária); o
  campo existe na tabela `audit_logs` para uma extensão futura via Edge
  Function.
- O reconhecimento de código de barras 1D por câmera pode variar entre
  aparelhos; por isso a mesma tela sempre oferece QR code e digitação manual
  como alternativas.
