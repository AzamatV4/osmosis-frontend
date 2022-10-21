import { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import classNames from "classnames";
import { AmountConfig } from "@keplr-wallet/hooks";
import { Duration } from "dayjs/plugin/duration";
import { useStore } from "../stores";
import { InputBox } from "../components/input";
import { CheckBox } from "../components/control";
import { ModalBase, ModalBaseProps } from "./base";
import {
  useConnectWalletModalRedirect,
  useBondLiquidityConfig,
  usePoolDetailConfig,
  useSuperfluidPoolConfig,
} from "../hooks";
import { ExternalIncentiveGaugeAllowList } from "../config";
import { useTranslation } from "react-multi-lang";

export const LockTokensModal: FunctionComponent<
  {
    poolId: string;
    amountConfig: AmountConfig;
    /** `electSuperfluid` is left undefined if it is irrelevant- if the user has already opted into superfluid in the past. */
    onLockToken: (duration: Duration, electSuperfluid?: boolean) => void;
  } & ModalBaseProps
> = observer((props) => {
  const { poolId, amountConfig: config, onLockToken } = props;
  const t = useTranslation();

  const { chainStore, accountStore, queriesStore } = useStore();

  const { chainId } = chainStore.osmosis;
  const queryOsmosis = queriesStore.get(chainId).osmosis!;
  const account = accountStore.getAccount(chainId);
  const { bech32Address } = account;

  // initialize pool data stores once root pool store is loaded
  const { poolDetailConfig } = usePoolDetailConfig(poolId);
  const { superfluidPoolConfig } = useSuperfluidPoolConfig(poolDetailConfig);
  const bondLiquidityConfig = useBondLiquidityConfig(bech32Address, poolId);

  const bondableDurations =
    bondLiquidityConfig?.getBondableAllowedDurations(
      (denom) => chainStore.getChain(chainId).forceFindCurrency(denom),
      ExternalIncentiveGaugeAllowList[poolId]
    ) ?? [];
  const availableToken = queryOsmosis.queryGammPoolShare.getAvailableGammShare(
    bech32Address,
    poolId
  );
  const isSendingMsg = account.txTypeInProgress !== "";
  const hasSuperfluidValidator =
    superfluidPoolConfig?.superfluid?.delegations &&
    superfluidPoolConfig.superfluid.delegations.length > 0;
  const superfluidApr =
    bondableDurations[bondableDurations.length - 1]?.superfluid?.apr;

  // component state
  const [selectedDurationIndex, setSelectedDurationIndex] = useState<
    number | null
  >(null);
  const highestDurationSelected =
    selectedDurationIndex === bondableDurations.length - 1;
  const [electSuperfluid, setElectSuperfluid] = useState(true);

  const selectedApr = selectedDurationIndex
    ? bondableDurations[selectedDurationIndex]?.aggregateApr
    : undefined;
  const superfluidInEffect = electSuperfluid && highestDurationSelected;

  const { showModalBase, accountActionButton } = useConnectWalletModalRedirect(
    {
      className: "h-16",
      disabled:
        config.error !== undefined ||
        selectedDurationIndex === null ||
        isSendingMsg,
      onClick: () => {
        const bondableDuration = bondableDurations.find(
          (_, index) => index === selectedDurationIndex
        );
        if (bondableDuration) {
          onLockToken(
            bondableDuration.duration,
            // Allow superfluid only for the highest gauge index.
            // On the mainnet, this standard works well
            // Logically it could be a problem if it's not the mainnet
            hasSuperfluidValidator ||
              !superfluidPoolConfig?.isSuperfluid ||
              !highestDurationSelected
              ? undefined
              : electSuperfluid
          );
        }
      },
      children:
        config.error?.message ||
        (electSuperfluid && !hasSuperfluidValidator && highestDurationSelected
          ? t("pool.lockToken.buttonNext")
          : superfluidInEffect
          ? "Bond & Stake"
          : t("pool.lockToken.buttonBond") || undefined),
    },
    props.onRequestClose
  );

  // auto select the gauge if there's one
  useEffect(() => {
    if (bondableDurations.length === 1) setSelectedDurationIndex(0);
  }, [bondableDurations]);

  return (
    <ModalBase
      title={`Lock Shares in Pool #${poolId}`}
      {...props}
      isOpen={props.isOpen && showModalBase}
    >
      <div className="flex flex-col gap-8">
        <span className="subtitle1 text-center">
          {t("pool.lockToken.unbondingPeriod")}
        </span>
        <h2 className="text-center">
          <span
            className={classNames({ "text-superfluid": superfluidInEffect })}
          >
            {selectedApr?.maxDecimals(2).toString() ?? "0%"}
          </span>{" "}
          APR
        </h2>
        <div className="flex md:flex-col gap-4 overflow-x-auto">
          {bondableDurations.map(({ duration, aggregateApr }, index) => (
            <LockupItem
              key={index}
              duration={duration.humanize()}
              isSelected={index === selectedDurationIndex}
              onSelect={() => setSelectedDurationIndex(index)}
              apr={aggregateApr?.maxDecimals(2).trim(true).toString()}
            />
          ))}
        </div>
        {superfluidPoolConfig?.isSuperfluid && (
          <CheckBox
            className="after:!bg-transparent after:!border-2 after:!rounded-[10px] -top-0.5 -left-0.5 after:!h-6 after:!w-6 after:!border-superfluid checked:after:bg-superfluid checked:after:border-none"
            isOn={highestDurationSelected && electSuperfluid}
            onToggle={() => setElectSuperfluid(!electSuperfluid)}
            checkMarkIconUrl="/icons/check-mark-dark.svg"
            checkMarkClassName="top-[1px] left-0 h-6 w-6"
            disabled={!highestDurationSelected || hasSuperfluidValidator}
          >
            <div
              className={classNames("flex flex-col gap-1", {
                "opacity-30":
                  !highestDurationSelected || hasSuperfluidValidator,
              })}
            >
              <h6>
                Superfluid Stake{" "}
                {superfluidApr && `(+${superfluidApr.maxDecimals(0)} APR)`}
              </h6>
              {poolDetailConfig?.longestDuration && (
                <span className="caption text-osmoverse-300">
                  {poolDetailConfig.longestDuration.asDays()} day bonding
                  requirement
                </span>
              )}
            </div>
          </CheckBox>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex items-center place-content-between">
            <span className="subtitle1">Amount To Bond</span>
            {availableToken && (
              <div className="flex gap-1 caption">
                <span>Available</span>
                <span
                  className="text-wosmongton-300 cursor-pointer"
                  onClick={() => config.setIsMax(true)}
                >
                  {availableToken.trim(true).toString()}
                </span>
              </div>
            )}
          </div>
          <InputBox
            type="number"
            currentValue={config.amount}
            onInput={(value) => config.setAmount(value)}
            placeholder=""
            rightEntry
          />
        </div>
        {accountActionButton}
      </div>
    </ModalBase>
  );
});

const LockupItem: FunctionComponent<{
  duration: string;
  isSelected: boolean;
  onSelect: () => void;
  apr?: string;
}> = ({ duration, isSelected, onSelect, apr }) => (
  <button
    onClick={onSelect}
    className={classNames(
      "rounded-xl px-5 md:py-3.5 py-5 md:px-4 w-full cursor-pointer min-w-[190px]",
      isSelected
        ? "bg-osmoverse-700 border-2 border-osmoverse-200"
        : "border border-osmoverse-600"
    )}
  >
    <div className="flex w-full place-content-between flex-col text-center">
      <h5>{duration}</h5>
      {apr && (
        <div className="flex items-center md:text-right text-center md:mx-0 mx-auto gap-2">
          <p className="subtitle1 md:m-0 mt-1 text-wosmongton-200 md:text-sm text-base">
            {apr}
          </p>
        </div>
      )}
    </div>
  </button>
);
