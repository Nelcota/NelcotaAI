// Messages for the SQLSTATEs each admin action can raise (see migrations V4, V6 and V7).

export const CONFIRM_TOPUP_ERRORS: ReadonlyMap<string, string> = new Map([
  ["P0002", "Este pedido não existe mais."],
  ["P0014", "Este pedido foi recusado ou cancelado e não pode ser confirmado."],
  ["P0017", "Esta referência de pagamento já foi usada em outro pedido."],
  ["22023", "A referência deve ter no máximo 120 caracteres."],
]);

export const CANCEL_TOPUP_ERRORS: ReadonlyMap<string, string> = new Map([
  ["P0002", "Este pedido não existe mais."],
  ["P0014", "Este pedido já foi decidido e não pode ser recusado."],
  ["22023", "Informe o motivo da recusa (até 500 caracteres)."],
]);

export const ADJUST_BALANCE_ERRORS: ReadonlyMap<string, string> = new Map([
  ["P0012", "O ajuste deixaria o saldo negativo."],
  ["22023", "Confira o valor e a descrição do ajuste."],
  ["P0002", "Empresa não encontrada."],
]);

export const LINK_USER_ERRORS: ReadonlyMap<string, string> = new Map([
  ["P0002", "Nenhuma conta com este e-mail. Crie o login no painel do Nelcota primeiro."],
  ["P0014", "Esta conta já está vinculada a uma empresa."],
  ["22023", "Informe o nome da pessoa (até 200 caracteres)."],
]);

export const ORGANIZATION_ERRORS: ReadonlyMap<string, string> = new Map([
  ["23505", "Já existe uma empresa com este CPF/CNPJ."],
  ["23514", "Confira o nome e o CPF/CNPJ."],
]);

export const SETTINGS_ERRORS: ReadonlyMap<string, string> = new Map([
  ["23514", "Confira os dados: cidade com até 15 caracteres e máximo maior ou igual ao mínimo."],
]);
