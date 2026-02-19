import mongoose from 'mongoose';
import AgentRate from '../models/AgentRates';
import { DEFAULT_AGENT_RATES } from '../config/defaultAgentRates';
import connectDB  from '../config/database';
import chalk from 'chalk';

/**
 * Script to seed agent rates into the database
 * Run with: npm run seed:agent-rates
 * Or: npx ts-node src/scripts/seedAgentRates.ts
 */
async function seedAgentRates() {
  try {
    console.log(chalk.blue('Connecting to database...'));
    await connectDB();

    console.log(chalk.blue('Seeding agent rates...'));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const rateConfig of DEFAULT_AGENT_RATES) {
      // Check if rate already exists
      const existing = await AgentRate.findOne({
        agentName: rateConfig.agentName,
        isActive: true,
      });

      if (existing) {
        // Check if rates have changed
        if (
          existing.inputTokenRate !== rateConfig.inputTokenRate ||
          existing.outputTokenRate !== rateConfig.outputTokenRate
        ) {
          // Deactivate old rate
          existing.isActive = false;
          await existing.save();

          // Create new rate with updated prices
          const newRate = new AgentRate({
            ...rateConfig,
            effectiveDate: new Date(),
            isActive: true,
          });
          await newRate.save();
          
          updated++;
          console.log(
            chalk.yellow(
              `Updated ${rateConfig.agentName}: $${rateConfig.inputTokenRate}/$${rateConfig.outputTokenRate} per 1M tokens`
            )
          );
        } else {
          skipped++;
          console.log(chalk.gray(`Skipped ${rateConfig.agentName}: rates unchanged`));
        }
      } else {
        // Create new rate
        const newRate = new AgentRate({
          ...rateConfig,
          effectiveDate: new Date(),
          isActive: true,
        });
        await newRate.save();
        
        created++;
        console.log(
          chalk.green(
            `Created ${rateConfig.agentName}: $${rateConfig.inputTokenRate}/$${rateConfig.outputTokenRate} per 1M tokens`
          )
        );
      }
    }

    console.log(chalk.blue.bold('\nSeeding complete!'));
    console.log(chalk.green(`  Created: ${created}`));
    console.log(chalk.yellow(`  Updated: ${updated}`));
    console.log(chalk.gray(`  Skipped: ${skipped}`));
    console.log(chalk.blue(`  Total: ${DEFAULT_AGENT_RATES.length}`));

    await mongoose.connection.close();
    console.log(chalk.blue('Database connection closed'));
  } catch (error) {
    console.error(chalk.red('Error seeding agent rates:'), error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedAgentRates();
}

export { seedAgentRates };

