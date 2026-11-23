// -----------------------------------------------------------------------------
// The tariffs of the virtual battery, read from the user's energy contract.
//
// The manifest declares an "Urban Solar — virtual battery" contract template
// (`energy_contracts`): the user creates their contract ONCE, in the Gladys
// contract wizard, with the grid price, the withdrawal fee and the monthly
// subscriptions. The integration reads the contracts created from its
// template with `getEnergyContracts()` — the only contracts it can read — and
// never asks for the prices in its own configuration.
//
// The template is `delegated`: Gladys asks the integration to price the
// energy of the meter linked to the contract (onEnergyPrice), and the
// integration answers with the Urban Solar billing — the kWh the virtual
// battery covered at the withdrawal fee, the rest at the grid price — so the
// Gladys energy dashboard shows what Urban Solar actually bills.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'tariffs' });

// Key of the template in the manifest `energy_contracts.templates`: stored by
// every contract created from it, never renamed.
export const CONTRACT_TEMPLATE_KEY = 'urban-solar-virtual-battery';

// The contracts change rarely (a new tariff once or twice a year): they are
// re-read every 15 minutes, and immediately from every pricing request.
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/**
 * The prices of a contract, from its template inputs. `null` when a price is
 * missing or invalid: no saving is better than a wrong one.
 * @returns {{ grid_price: number, discharge_fee: number } | null}
 */
export function ratesFromInputs(inputs = {}) {
  const grid = Number(inputs.grid_price);
  const fee = Number(inputs.discharge_fee);
  if (!Number.isFinite(grid) || !Number.isFinite(fee) || grid < 0 || fee < 0) {
    return null;
  }
  return { grid_price: grid, discharge_fee: fee };
}

/** Whether `contract` is in force on `day` (`YYYY-MM-DD`, bounds inclusive). */
function coversDay(contract, day) {
  return contract.valid_from <= day && (contract.valid_to === null || day <= contract.valid_to);
}

export function createTariffs({ gladys, now = () => new Date() }) {
  let contracts = [];
  let fetchedAt = null;

  const usable = (contract) =>
    contract.template_key === CONTRACT_TEMPLATE_KEY && contract.status !== 'orphaned';

  return {
    /** Re-read the contracts when due (or `force`). Never throws. */
    async refresh({ force = false } = {}) {
      const nowMs = now().getTime();
      if (!force && fetchedAt !== null && nowMs - fetchedAt < REFRESH_INTERVAL_MS) return;
      try {
        contracts = (await gladys.getEnergyContracts()).filter(usable);
        fetchedAt = nowMs;
      } catch (err) {
        logger.warn(`Cannot read the energy contracts: ${err.message}`);
      }
    },

    /** Take the inputs a pricing request carries: fresher than the cache. */
    remember(contractRef) {
      const known = contracts.find((contract) => contract.id === contractRef.id);
      if (known) known.inputs = contractRef.inputs;
    },

    /**
     * The contract in force on `day`: the most recent one when several
     * overlap (a new tariff entered before the old contract was closed).
     */
    contractFor(day) {
      return (
        contracts
          .filter((contract) => coversDay(contract, day))
          .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0] ?? null
      );
    },

    /** The prices in force on `day`, `null` without an Urban Solar contract. */
    ratesFor(day) {
      const contract = this.contractFor(day);
      return contract ? ratesFromInputs(contract.inputs) : null;
    },

    get count() {
      return contracts.length;
    },
  };
}
