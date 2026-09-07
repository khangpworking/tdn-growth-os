import type { AuthorizedPlan } from '../../../contracts/flow/authorized-plan.generated.js';
import type { ApprovedProposalIntakeService } from './approved-proposal-intake-service.js';

export interface AuthorizedPlanReader {
  readVerifiedAuthorizedPlan(planId: string): Promise<AuthorizedPlan>;
}

export class FlowAuthorizedPlanReader implements AuthorizedPlanReader {
  readonly #plans: ApprovedProposalIntakeService;

  constructor(plans: ApprovedProposalIntakeService) {
    this.#plans = plans;
  }

  async readVerifiedAuthorizedPlan(planId: string): Promise<AuthorizedPlan> {
    return this.#plans.replay(planId);
  }
}
