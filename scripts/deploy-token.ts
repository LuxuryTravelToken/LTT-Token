import hre, { ethers } from "hardhat";
import { Token__factory } from "../typechain-types/factories/contracts/Token__factory";
import { Token } from "../typechain-types/contracts/Token";

async function main() {
  let token: Token;
  const name = "Orange Token";
  const symbol = "OT";
  const admin = '0x131D1697d2cFB060493C14A4e6Fa72892770588E';

  const Token = (await ethers.getContractFactory('Token')) as Token__factory;
  token = await Token.deploy(name, symbol, admin);

  await token.waitForDeployment();

  console.log("Token deployed to:", token.target);

  await token.deploymentTransaction()?.wait(5)

  await hre.run("verify:verify", {
    address: token.target,
    constructorArguments: [name, symbol, admin],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
