# Feature: Marcas (brands) nos itens

## Contexto
Item é genérico ("Feijão 1kg"); a mesma necessidade tem várias marcas (Camil, Kicaldo, Tio João), preços diferentes, código de barras próprio por marca. Quero comparar qual marca está mais barata e, na compra, registrar a marca que levei (a usual pode estar em falta).

## Decisões (travadas)
- Marca é **opcional** (item pode ter 0+ marcas; "Banana" sem marca).
- Lista de compras tem **item genérico**; marca é escolhida **na hora da compra**.
- "Mais barato" cruza **todas as marcas** do item → mostra marca+loja+preço.

## Requisitos
- MK-1: item tem 0+ marcas (nome). CRUD de marca dentro do item.
- MK-2: código de barras pertence a uma **marca** do item (brand_id opcional — barcode pode ser do item sem marca).
- MK-3: registro de preço guarda **marca** (além de item, loja, data). brand_id opcional.
- MK-4: "loja mais barata" e estimativa consideram a marca mais barata entre todas; alerta de aumento compara mesma loja **e** mesma marca.
- MK-5: na compra (CheckItemSheet) escolho a marca levada (dropdown das marcas do item + criar nova na hora). Preço real grava com a marca.
- MK-6: scanner resolve barcode → (item, marca). Se desconhecido: fluxo fácil pra escolher/criar item + escolher/criar marca + colar o código, tudo numa folha. Usável no modo compra e no cadastro do item.
- MK-7: item da sessão guarda a marca comprada (actual_brand_id).

## Fora de escopo
- Foto/preço-alvo por marca (YAGNI; foto segue por item).
- Marca obrigatória.

## Critérios de aceite
- Criar item "Feijão 1kg" com 2 marcas, cada uma com seu código de barras.
- Registrar preço de 2 marcas em lojas → "mais barato" mostra marca+loja correta.
- Na compra: escolher marca, registrar preço; se faltar, escolher/criar outra marca na hora.
- Escanear código novo → criar/selecionar item + marca + colar código sem sair do fluxo.
- Tudo offline-first, 6 idiomas.
