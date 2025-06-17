import { getLogger } from './logger';
import { User, userCredits, NewUserCredit, UserCredit } from '../db/control/auth';
import { UsageInfo, ProviderName } from '../providers/types';
import { getProviderCostPerToken } from '../providers/pricing';
import { eq, and, desc, sum } from 'drizzle-orm';

export interface CreditTransaction {
  userId: string;
  type: 'usage' | 'topup' | 'refund' | 'bonus';
  amount: number; // in cents
  description: string;
  provider?: ProviderName;
  model?: string;
  tokensUsed?: number;
  metadata?: {
    messageId?: string;
    conversationId?: string;
    promptTokens?: number;
    completionTokens?: number;
    [key: string]: any;
  };
}

export interface UsageCost {
  costInCents: number;
  tokensUsed: number;
  promptTokens: number;
  completionTokens: number;
}

export class CreditManager {
  private db: any;
  private env: CloudflareBindings;

  constructor(db: any, env: CloudflareBindings) {
    this.db = db;
    this.env = env;
  }

  /**
   * Calculate cost for AI model usage
   */
  calculateUsageCost(
    provider: ProviderName,
    model: string,
    usage: UsageInfo,
    isUserKey: boolean = true
  ): UsageCost {
    const logger = getLogger(this.env);
    
    try {
      const pricing = getProviderCostPerToken(provider, model);
      
      const promptCost = usage.promptTokens * pricing.promptTokenCost;
      const completionCost = usage.completionTokens * pricing.completionTokenCost;
      let baseCost = promptCost + completionCost;
      
      // Add 5% markup when using system API keys (not user's own keys)
      if (!isUserKey) {
        baseCost = baseCost * 1.05;
      }
      
      const totalCostInCents = Math.ceil(baseCost * 100); // Convert to cents and round up

      logger.debug('CREDIT', 'Usage cost calculated', {
        provider,
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        costInCents: totalCostInCents,
        isUserKey,
        markupApplied: !isUserKey,
        pricing
      });

      return {
        costInCents: totalCostInCents,
        tokensUsed: usage.totalTokens,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens
      };
    } catch (error) {
      logger.error('CREDIT', 'Failed to calculate usage cost', {
        provider,
        model,
        usage,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Fallback cost calculation - very rough estimate
      const fallbackCostPerToken = 0.000001; // $0.000001 per token
      const fallbackCostInCents = Math.ceil(usage.totalTokens * fallbackCostPerToken * 100);
      
      return {
        costInCents: fallbackCostInCents,
        tokensUsed: usage.totalTokens,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens
      };
    }
  }

  /**
   * Check if user has sufficient credits for an operation
   */
  async checkSufficientCredits(
    userId: string,
    estimatedCostInCents: number
  ): Promise<{ sufficient: boolean; currentBalance: number; required: number }> {
    const logger = getLogger(this.env);
    
    try {
      const user = await this.db
        .select({ credits: this.db.users.credits })
        .from(this.db.users)
        .where(eq(this.db.users.id, userId))
        .get();

      if (!user) {
        throw new Error('User not found');
      }

      const sufficient = user.credits >= estimatedCostInCents;
      
      logger.debug('CREDIT', 'Credit sufficiency check', {
        userId,
        currentBalance: user.credits,
        required: estimatedCostInCents,
        sufficient
      });

      return {
        sufficient,
        currentBalance: user.credits,
        required: estimatedCostInCents
      };
    } catch (error) {
      logger.error('CREDIT', 'Failed to check credit sufficiency', {
        userId,
        estimatedCost: estimatedCostInCents,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Deduct credits for usage and record transaction
   */
  async deductCreditsForUsage(
    userId: string,
    provider: ProviderName,
    model: string,
    usage: UsageInfo,
    isUserKey: boolean = true,
    metadata?: CreditTransaction['metadata']
  ): Promise<{ newBalance: number; transactionId: string; costInCents: number }> {
    const logger = getLogger(this.env);
    
    try {
      const usageCost = this.calculateUsageCost(provider, model, usage, isUserKey);
      
      // Start transaction
      const result = await this.db.transaction(async (tx: any) => {
        // Get current user balance
        const user = await tx
          .select({ credits: tx.users.credits })
          .from(tx.users)
          .where(eq(tx.users.id, userId))
          .get();

        if (!user) {
          throw new Error('User not found');
        }

        if (user.credits < usageCost.costInCents) {
          throw new Error(`Insufficient credits. Required: ${usageCost.costInCents}, Available: ${user.credits}`);
        }

        const newBalance = user.credits - usageCost.costInCents;

        // Update user balance
        await tx
          .update(tx.users)
          .set({ credits: newBalance })
          .where(eq(tx.users.id, userId));

        // Record transaction
        const transaction = await tx
          .insert(userCredits)
          .values({
            userId,
            type: 'usage',
            amount: -usageCost.costInCents, // Negative for usage
            balanceAfter: newBalance,
            description: `AI usage - ${provider}/${model}`,
            provider,
            model,
            tokensUsed: usageCost.tokensUsed,
            metadata: {
              ...metadata,
              promptTokens: usageCost.promptTokens,
              completionTokens: usageCost.completionTokens
            }
          })
          .returning({ id: userCredits.id });

        return {
          newBalance,
          transactionId: transaction[0].id,
          costInCents: usageCost.costInCents
        };
      });

      logger.info('CREDIT', 'Credits deducted for usage', {
        userId,
        provider,
        model,
        costInCents: result.costInCents,
        newBalance: result.newBalance,
        transactionId: result.transactionId
      });

      return result;
    } catch (error) {
      logger.error('CREDIT', 'Failed to deduct credits for usage', {
        userId,
        provider,
        model,
        usage,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Add credits to user account (top-up, bonus, refund)
   */
  async addCredits(
    userId: string,
    amount: number,
    type: 'topup' | 'refund' | 'bonus',
    description: string,
    metadata?: CreditTransaction['metadata']
  ): Promise<{ newBalance: number; transactionId: string }> {
    const logger = getLogger(this.env);
    
    try {
      const result = await this.db.transaction(async (tx: any) => {
        // Get current user balance
        const user = await tx
          .select({ credits: tx.users.credits })
          .from(tx.users)
          .where(eq(tx.users.id, userId))
          .get();

        if (!user) {
          throw new Error('User not found');
        }

        const newBalance = user.credits + amount;

        // Update user balance
        await tx
          .update(tx.users)
          .set({ credits: newBalance })
          .where(eq(tx.users.id, userId));

        // Record transaction
        const transaction = await tx
          .insert(userCredits)
          .values({
            userId,
            type,
            amount,
            balanceAfter: newBalance,
            description,
            metadata
          })
          .returning({ id: userCredits.id });

        return {
          newBalance,
          transactionId: transaction[0].id
        };
      });

      logger.info('CREDIT', 'Credits added to account', {
        userId,
        amount,
        type,
        newBalance: result.newBalance,
        transactionId: result.transactionId
      });

      return result;
    } catch (error) {
      logger.error('CREDIT', 'Failed to add credits', {
        userId,
        amount,
        type,
        description,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get user's credit transaction history
   */
  async getCreditHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<UserCredit[]> {
    const logger = getLogger(this.env);
    
    try {
      const transactions = await this.db
        .select()
        .from(userCredits)
        .where(eq(userCredits.userId, userId))
        .orderBy(desc(userCredits.createdAt))
        .limit(limit)
        .offset(offset);

      logger.debug('CREDIT', 'Retrieved credit history', {
        userId,
        transactionCount: transactions.length,
        limit,
        offset
      });

      return transactions;
    } catch (error) {
      logger.error('CREDIT', 'Failed to get credit history', {
        userId,
        limit,
        offset,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get user's current balance
   */
  async getCurrentBalance(userId: string): Promise<number> {
    const logger = getLogger(this.env);
    
    try {
      const user = await this.db
        .select({ credits: this.db.users.credits })
        .from(this.db.users)
        .where(eq(this.db.users.id, userId))
        .get();

      if (!user) {
        throw new Error('User not found');
      }

      logger.debug('CREDIT', 'Retrieved current balance', {
        userId,
        balance: user.credits
      });

      return user.credits;
    } catch (error) {
      logger.error('CREDIT', 'Failed to get current balance', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get usage statistics for a user
   */
  async getUsageStats(
    userId: string,
    days: number = 30
  ): Promise<{
    totalSpent: number;
    totalTokens: number;
    transactionCount: number;
    averageCostPerDay: number;
    topProviders: Array<{ provider: string; spent: number; tokens: number }>;
  }> {
    const logger = getLogger(this.env);
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // Get usage transactions only
      const transactions = await this.db
        .select()
        .from(userCredits)
        .where(
          and(
            eq(userCredits.userId, userId),
            eq(userCredits.type, 'usage'),
            this.db.gte(userCredits.createdAt, cutoffDate)
          )
        );

      const totalSpent = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const totalTokens = transactions.reduce((sum, t) => sum + (t.tokensUsed || 0), 0);
      const transactionCount = transactions.length;
      const averageCostPerDay = days > 0 ? totalSpent / days : 0;

      // Calculate top providers
      const providerStats = new Map<string, { spent: number; tokens: number }>();
      transactions.forEach(t => {
        if (t.provider) {
          const existing = providerStats.get(t.provider) || { spent: 0, tokens: 0 };
          providerStats.set(t.provider, {
            spent: existing.spent + Math.abs(t.amount),
            tokens: existing.tokens + (t.tokensUsed || 0)
          });
        }
      });

      const topProviders = Array.from(providerStats.entries())
        .map(([provider, stats]) => ({ provider, ...stats }))
        .sort((a, b) => b.spent - a.spent)
        .slice(0, 5);

      logger.debug('CREDIT', 'Retrieved usage statistics', {
        userId,
        days,
        totalSpent,
        totalTokens,
        transactionCount,
        topProviders: topProviders.length
      });

      return {
        totalSpent,
        totalTokens,
        transactionCount,
        averageCostPerDay,
        topProviders
      };
    } catch (error) {
      logger.error('CREDIT', 'Failed to get usage statistics', {
        userId,
        days,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}