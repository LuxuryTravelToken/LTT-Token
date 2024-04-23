import hre, { ethers } from "hardhat";
import { Vesting__factory } from "../typechain-types/factories/contracts/Vesting__factory";
import { Vesting } from "../typechain-types/contracts/Vesting";

async function main() {
  let vesting: Vesting;
  const token = '0x440502f4843Ba5d942CFcFFDA0f0eEE1c84fA1Ac';
  const admin = '0x131D1697d2cFB060493C14A4e6Fa72892770588E';

  const Vesting = (await ethers.getContractFactory('Vesting')) as Vesting__factory;
  vesting = await Vesting.deploy(token, admin);

  await vesting.waitForDeployment();

  console.log("Vesting deployed to:", vesting.target);

  await vesting.deploymentTransaction()?.wait(5)

  await hre.run("verify:verify", {
    address: vesting.target,
    constructorArguments: [token, admin],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
