# Currículo — Stefanie Santos da Silva

Currículo em PDF (A4, uma página) gerado por código, então qualquer texto pode ser
editado e o arquivo regerado sem perder o layout.

- **Arquivo final:** [`Curriculo_Stefanie_Santos_2026.pdf`](Curriculo_Stefanie_Santos_2026.pdf)
- **Gerador:** [`build_curriculo.py`](build_curriculo.py)
- **Fontes e foto:** `assets/`

## Layout

- Coluna lateral escura (azul-marinho com gradiente) com foto recortada em círculo,
  contato, competências e chips de perfil.
- Coluna principal clara com nome em Plus Jakarta Sans ExtraBold, pílulas das áreas de
  atuação, seções com marcador de losango em verde-petróleo e linha do tempo na
  experiência profissional.
- Detalhes: anel teal na foto, filetes em dourado, rodapé com régua de destaque,
  metadados do PDF preenchidos (título, autor, assunto, palavras-chave).

## Como regerar

```bash
pip install reportlab pillow
python3 build_curriculo.py                     # grava Curriculo_Stefanie_Santos_2026.pdf
python3 build_curriculo.py /caminho/saida.pdf  # ou em outro caminho
```

O texto (contatos, experiências, competências) fica no dicionário `DADOS` no topo do
script — basta editar e rodar de novo.

## Conteúdo

Baseado no currículo original enviado, com o telefone **+55 (47) 9980-2403** adicionado
ao bloco de contato e ao rodapé. O restante das informações (e-mail, cidade, endereço,
experiências na Havan, R Brasil Soluções e TIVIT) foi mantido como no original.

## Licenças dos assets

| Asset | Licença |
| --- | --- |
| Inter | SIL Open Font License 1.1 — `assets/licenses/OFL-Inter.txt` |
| Plus Jakarta Sans | SIL Open Font License 1.1 — `assets/licenses/OFL-PlusJakartaSans.txt` |
| Font Awesome Free (ícones) | Fontes: OFL 1.1; ícones: CC BY 4.0 — `assets/licenses/FontAwesome-Free.txt` |
| Foto | imagem fornecida pela titular do currículo |
